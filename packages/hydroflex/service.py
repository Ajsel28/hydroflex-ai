"""High-level run services and the JSON payload format shared by the API, UI and experiment pipeline."""

from __future__ import annotations

import datetime as dt
import math
import platform
import time
import uuid
from typing import Any

import numpy as np

from hydroflex import SYNTHETIC_LABEL, __version__
from hydroflex.analytics.explain import explain
from hydroflex.climate.scenarios import PRESETS, ScenarioSpec, stochastic_scenario_set
from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts, assumptions_table
from hydroflex.optimization.model import ModelInput, ModelResult, RiskOptions
from hydroflex.optimization.runner import (
    REP_WEEK_START_DAYS,
    REP_WEEK_START_DAYS_4,
    RunConfig,
    run,
    run_repweeks,
)

DATA_LABEL = {
    "weather-derived+reconstructed+synthetic":
        "PV/wind: weather-derived from NASA POWER (not measured output) · inflows: reconstructed from NASA POWER "
        "precipitation (not gauged) · demand & prices: " + SYNTHETIC_LABEL,
    "synthetic": SYNTHETIC_LABEL,
}

PROVENANCE_IDS = ["processed_hourly_profiles", "processed_inflow_daily", "nasa_power_hourly_solar_fier",
                  "nasa_power_hourly_wind_vlore", "nasa_power_hourly_wind_lezhe", "nasa_power_hourly_load_tirana",
                  "nasa_power_daily_drin_white", "nasa_power_daily_drin_black", "nasa_power_daily_drin_kukes",
                  "nasa_power_daily_drin_koman"]


def _clean(x: Any) -> Any:
    if isinstance(x, dict):
        return {str(k): _clean(v) for k, v in x.items()}
    if isinstance(x, list | tuple):
        return [_clean(v) for v in x]
    if isinstance(x, np.ndarray):
        return [_clean(v) for v in x.tolist()]
    if isinstance(x, np.floating | float):
        v = float(x)
        return None if not math.isfinite(v) else round(v, 6)
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    return x


def build_params(system: dict | None, scenario_over: dict | None = None) -> tuple[SystemParams, TechnologyCosts]:
    system = {k: v for k, v in (system or {}).items() if v is not None}
    p = SystemParams()
    upd: dict[str, Any] = {}
    mapping = {"pv_mw": "pv_existing_mw", "wind_mw": "wind_existing_mw", "battery_power_mw": "battery_power_existing_mw",
               "battery_energy_mwh": "battery_energy_existing_mwh", "import_capacity_mw": "import_capacity_mw",
               "voll_eur_mwh": "voll_eur_mwh"}
    for k, v in system.items():
        if k in mapping:
            upd[mapping[k]] = v
    p = p.model_copy(update=upd)
    SystemParams.model_validate(p.model_dump())
    c = TechnologyCosts()
    cu: dict[str, Any] = {}
    if "discount_rate" in system:
        cu["discount_rate"] = system["discount_rate"]
    if "battery_cost_multiplier" in system:
        m = system["battery_cost_multiplier"]
        cu["battery_energy_capex_eur_per_kwh"] = c.battery_energy_capex_eur_per_kwh * m
        cu["battery_power_capex_eur_per_kw"] = c.battery_power_capex_eur_per_kw * m
    return p, c.model_copy(update=cu)


def scenario_from(key: str, over: dict | None) -> ScenarioSpec:
    s = PRESETS[key]
    over = {k: v for k, v in (over or {}).items() if v is not None}
    if over:
        s = s.model_copy(update=over)
        s = s.model_copy(update={"label": s.label + " (custom)"})
    return s


def payload(res: ModelResult, mi: ModelInput, mode: str, kind: str, request: dict, label: str | None,
            cfg: RunConfig, seconds: float, extra: dict | None = None, run_id: str | None = None,
            include_timeseries: bool = True) -> dict[str, Any]:
    ts_out: dict[str, Any] = {}
    if include_timeseries and res.optimal and mi.timestamps is not None:
        ts_out["timestamps"] = [t.isoformat().replace("+00:00", "Z") for t in mi.timestamps]
        ts_out["scenarios"] = {k: {name: np.round(arr, 3) for name, arr in v.items()} for k, v in res.timeseries.items()}
    import highspy
    import pandas
    import scipy

    out = {
        "run_id": run_id or f"run-{dt.datetime.now(dt.UTC).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "kind": kind,
        "label": label,
        "created_utc": dt.datetime.now(dt.UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "freshly_computed": True,
        "input": request,
        "data_mode": mode,
        "data_label": DATA_LABEL.get(mode, mode),
        "status": res.status,
        "optimal": res.optimal,
        "objective_keur": res.objective_keur,
        "objective_keur_annualised": res.objective_keur / mi.horizon_weight if res.optimal else None,
        "horizon": {"steps": mi.T, "resolution_h": mi.dt, "hours": mi.T * mi.dt,
                    "start_utc": mi.timestamps[0].isoformat() if mi.timestamps is not None else None,
                    "weight_of_year": mi.horizon_weight, "boundary": cfg.boundary, "metrics_basis": "horizon"},
        "capacities": res.capacities, "additions": res.additions, "expected": res.expected, "risk": res.risk,
        "duals": res.duals, "scenarios": res.scenario_results,
        "timeseries": ts_out,
        "explanations": explain(res, mi),
        "solver": res.solver,
        "warnings": res.warnings,
        "assumptions": assumptions_table(mi.params, mi.costs),
        "provenance": PROVENANCE_IDS if mode != "synthetic" else ["synthetic_fallback"],
        "execution": {"seconds": seconds, "hydroflex": __version__, "python": platform.python_version(),
                      "numpy": np.__version__, "pandas": pandas.__version__, "scipy": scipy.__version__,
                      "highspy": getattr(highspy, "__version__", res.solver.get("version", ""))},
    }
    if extra:
        out.update(extra)
    return _clean(out)


def run_simulation(req: dict, kind: str = "simulate", invest: InvestmentOptions | None = None,
                   run_id: str | None = None, include_timeseries: bool = True) -> dict[str, Any]:
    t0 = time.perf_counter()
    p, c = build_params(req.get("system"))
    spec = scenario_from(req.get("scenario", "normal"), req.get("scenario_overrides"))
    h = req.get("horizon") or {}
    cfg = RunConfig(scenarios=[spec], params=p, costs=c, invest=invest or InvestmentOptions(),
                    hours=int(h.get("hours", 168)), start_hour=int(h.get("start_day", 14)) * 24,
                    resolution_h=int(h.get("resolution_h", 1)), time_limit=90)
    res, mi, mode = run(cfg)
    return payload(res, mi, mode, kind, req, req.get("label"), cfg, time.perf_counter() - t0, run_id=run_id,
                   include_timeseries=include_timeseries)


def run_investment(req: dict, run_id: str | None = None) -> dict[str, Any]:
    inv = InvestmentOptions(enabled=True, budget_meur=req.get("budget_meur", 500), pv_max_mw=req.get("pv_max_mw", 2000),
                            wind_max_mw=req.get("wind_max_mw", 1000),
                            battery_power_max_mw=req.get("battery_power_max_mw", 1000),
                            battery_energy_max_mwh=req.get("battery_energy_max_mwh", 4000))
    return run_simulation(req, kind="investment", invest=inv, run_id=run_id)


def run_stochastic(req: dict, run_id: str | None = None, scenarios: list[ScenarioSpec] | None = None,
                   include_timeseries: bool = False) -> dict[str, Any]:
    """Two-stage stochastic investment planning with optional CVaR, plus deterministic comparison.

    method "representative_weeks" (default): 8 hourly weeks per scenario, nested reservoir boundaries.
    method "annual_chronological": full year per scenario at ``horizon.resolution_h`` (default 6 h).
    """
    t0 = time.perf_counter()
    p, c = build_params(req.get("system"))
    method = req.get("method", "representative_weeks")
    h = req.get("horizon") or {"hours": 8760, "start_day": 0, "resolution_h": 6}
    inv = InvestmentOptions(enabled=True, budget_meur=req.get("budget_meur", 500),
                            **{k: req[k] for k in ("pv_max_mw", "wind_max_mw", "battery_power_max_mw",
                                                   "battery_energy_max_mwh") if k in req})
    scen = scenarios or stochastic_scenario_set()
    risk = RiskOptions(alpha=req.get("risk_alpha", 0.9), weight=req.get("risk_lambda", 0.0))
    base = dict(params=p, costs=c, hours=int(h["hours"]), start_hour=int(h["start_day"]) * 24,
                resolution_h=int(h["resolution_h"]), time_limit=300)

    def _solve(cfg: RunConfig, keep: bool = False) -> tuple[ModelResult, ModelInput, dict]:
        if method == "representative_weeks":
            weeks = REP_WEEK_START_DAYS_4 if int(req.get("n_weeks", 8)) == 4 else REP_WEEK_START_DAYS
            return run_repweeks(cfg, keep_timeseries=keep, weeks=weeks, passes=int(req.get("boundary_passes", 1)))
        r, m, _ = run(cfg, keep_timeseries=keep)
        return r, m, {}

    cfg = RunConfig(scenarios=scen, invest=inv, risk=risk, **base)
    res, mi, info = _solve(cfg, keep=include_timeseries)
    extra: dict[str, Any] = {"stochastic": {
        "implemented": True, "n_scenarios": len(scen), "method": method, "boundary_passes": info.get("passes"),
        "week_start_days": info.get("week_start_days"),
        "formulation": "two-stage: capacities shared across scenarios, scenario-specific hourly dispatch; "
                       "CVaR via Rockafellar–Uryasev auxiliary variables (one excess variable per scenario)"}}
    if req.get("compare_deterministic", True) and res.optimal:
        # Deterministic plan: optimise for the 'normal' scenario only, then evaluate it on all scenarios
        normal = next((s for s in scen if s.key == "normal"), scen[0])
        det, _, _ = _solve(RunConfig(scenarios=[normal.model_copy(update={"probability": 1.0})], invest=inv, **base))
        if det.optimal:
            fixed = {k: det.capacities[k] for k in ("pv", "wind", "bp", "be")}
            ev, _, _ = _solve(RunConfig(scenarios=scen, invest=inv, fixed_capacity=fixed, risk=risk, **base))
            ws = []
            for s in scen:
                r1, _, _ = _solve(RunConfig(scenarios=[s.model_copy(update={"probability": 1.0})], invest=inv, **base))
                ws.append((s.probability, r1.objective_keur if r1.optimal else float("nan"),
                           r1.additions if r1.optimal else {}))
            ws_obj = sum(pr * o for pr, o, _ in ws)
            lam = risk.weight
            w = mi.horizon_weight
            rp_e = res.objective_keur - (lam * res.risk["cvar_keur"] if lam > 0 else 0.0)
            eev_e = (ev.objective_keur - (lam * ev.risk["cvar_keur"] if lam > 0 else 0.0)) if ev.optimal else float("nan")
            vss = (ev.objective_keur - res.objective_keur) if ev.optimal else float("nan")  # risk-adjusted objective
            extra["deterministic_comparison"] = {
                "deterministic_plan_capacities": det.capacities, "deterministic_plan_additions": det.additions,
                "deterministic_objective_normal_only_keur": det.objective_keur,
                "eev_objective_keur": ev.objective_keur if ev.optimal else None,
                "rp_objective_keur": res.objective_keur,
                "eev_expected_cost_keur": eev_e, "rp_expected_cost_keur": rp_e,
                "eev_expected_cost_keur_annualised": eev_e / w, "rp_expected_cost_keur_annualised": rp_e / w,
                "vss_keur": vss, "vss_keur_annualised": vss / w,
                "expected_cost_premium_keur_annualised": (rp_e - eev_e) / w,
                "eev_cvar_keur": ev.risk.get("cvar_keur") if ev.optimal else None,
                "rp_cvar_keur": res.risk.get("cvar_keur"),
                "eev_cvar_keur_annualised": ev.risk.get("cvar_keur_annualised") if ev.optimal else None,
                "rp_cvar_keur_annualised": res.risk.get("cvar_keur_annualised"),
                "cvar_reduction_keur_annualised": ((ev.risk.get("cvar_keur_annualised") or 0)
                                                   - (res.risk.get("cvar_keur_annualised") or 0)) if ev.optimal else None,
                "eev_scenarios": ev.scenario_results if ev.optimal else [],
                "wait_and_see_expected_keur": ws_obj,
                "evpi_keur": (rp_e - ws_obj) if lam == 0 else None,
                "evpi_keur_annualised": ((rp_e - ws_obj) / w) if lam == 0 else None,
                "wait_and_see_additions": {s.key: wv[2] for s, wv in zip(scen, ws, strict=True)},
                "notes": "VSS = EEV − RP on the full (risk-adjusted) objective E[cost] + λ·CVaR, hence VSS ≥ 0. "
                         "expected_cost_premium = RP − EEV on expected cost alone (the price of risk aversion). "
                         "EVPI = RP − WS is reported only for λ = 0. The deterministic plan is optimised for the normal "
                         "scenario and evaluated on all scenarios with the same reservoir boundaries.",
            }
    req_rec = dict(req)
    req_rec["scenario_set"] = [s.model_dump() for s in scen]
    from hydroflex.data.loader import load_profiles

    out = payload(res, mi, load_profiles()[1], "stochastic", req_rec, req.get("label"), cfg, time.perf_counter() - t0, extra=extra,
                  run_id=run_id, include_timeseries=include_timeseries)
    out["horizon"]["metrics_basis"] = "annualised" if method == "representative_weeks" else "horizon"
    return out
