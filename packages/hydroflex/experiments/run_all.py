"""Reproducible numerical experiments A–J, sensitivity, resolution and validation studies.

    python -m hydroflex.experiments.run_all            # run everything (cached per experiment)
    python -m hydroflex.experiments.run_all --force    # recompute
    python -m hydroflex.experiments.run_all --only A,B,H

Outputs (machine-readable, never hand-edited):
    results/experiments/<id>.json        experiment artefacts (reference payloads for the UI/API)
    results/experiments/manifest.json    software versions, seeds, timings, git commit
Figures and LaTeX tables are generated from these files by hydroflex.experiments.figures / .tables.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor
from typing import Any

import numpy as np

from hydroflex import REPO_ROOT, RESULTS_DIR, SYNTHETIC_LABEL, __version__
from hydroflex.analytics.pareto import pareto_mask, regret_matrix
from hydroflex.climate.scenarios import PRESETS, ScenarioSpec, stochastic_scenario_set
from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts
from hydroflex.data.profiles import SEED
from hydroflex.optimization.model import RiskOptions
from hydroflex.optimization.runner import RunConfig, run, run_repweeks
from hydroflex.service import DATA_LABEL, _clean, run_simulation, run_stochastic

OUT = RESULTS_DIR / "experiments"
WORKERS = int(os.getenv("HYDROFLEX_WORKERS", "2"))
FORCE = False
KEYS = ["demand_mwh", "ens_mwh", "lol_hours", "lolp", "peak_shortfall_mw", "imports_mwh", "exports_mwh",
        "net_imports_mwh", "import_share", "import_cap_binding_hours", "pv_mwh", "wind_mwh", "ror_mwh", "hydro_res_mwh",
        "pv_curtail_mwh", "wind_curtail_mwh", "curtailment_share", "res_spill_hm3", "res_v_min_hm3", "res_hours_at_min",
        "battery_throughput_mwh", "battery_cycles", "domestic_supply_share", "opex_keur", "opex_keur_annualised",
        "import_cost_keur", "export_revenue_keur", "unserved_penalty_keur", "capex_keur", "total_cost_keur_annualised",
        "cost_per_mwh_served_eur", "price_mean_eur_mwh", "price_max_eur_mwh", "max_balance_residual_mw",
        "max_water_residual_hm3", "max_soc_residual_mwh", "simultaneous_ch_dis_mwh"]
DATA_NOTE = DATA_LABEL["weather-derived+reconstructed+synthetic"]
BUDGET = 500.0
TIMINGS: dict[str, float] = {}


# ---------------------------------------------------------------------------------------------
def _now() -> str:
    return dt.datetime.now(dt.UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def save(name: str, obj: dict[str, Any]) -> dict[str, Any]:
    OUT.mkdir(parents=True, exist_ok=True)
    obj.setdefault("run_id", name)
    obj.setdefault("created_utc", _now())
    obj.setdefault("status", "Optimal")
    obj.setdefault("data_label", DATA_NOTE)
    obj["reference"] = True
    obj["freshly_computed"] = False
    obj = _clean(obj)
    (OUT / f"{name}.json").write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    return obj


def cached(name: str) -> dict[str, Any] | None:
    f = OUT / f"{name}.json"
    if f.exists() and not FORCE:
        return json.loads(f.read_text(encoding="utf-8"))
    return None


def params(**kw: Any) -> SystemParams:
    return SystemParams().model_copy(update=kw)


def fleet(pv: float = 300, wind: float = 0, bp: float = 0, be: float = 0, **kw: Any) -> SystemParams:
    return params(pv_existing_mw=pv, wind_existing_mw=wind, battery_power_existing_mw=bp,
                  battery_energy_existing_mwh=be, **kw)


def _dispatch_job(job: dict[str, Any]) -> dict[str, Any]:
    """Worker: one annual (or windowed) dispatch run → compact metrics. Top-level for multiprocessing."""
    spec = ScenarioSpec(**job["scenario"])
    p = SystemParams(**job["params"])
    c = TechnologyCosts(**job.get("costs", {}))
    cfg = RunConfig(scenarios=[spec], params=p, costs=c, hours=job.get("hours", 8760), start_hour=job.get("start_hour", 0),
                    resolution_h=job.get("res", 1), fixed_capacity=job.get("fixed"))
    t0 = time.perf_counter()
    r, mi, _ = run(cfg, keep_timeseries=False)
    out = {"tag": job.get("tag"), "status": r.status, "optimal": r.optimal, "seconds": time.perf_counter() - t0,
           "objective_keur": r.objective_keur, "objective_keur_annualised": r.objective_keur / mi.horizon_weight
           if r.optimal else None, "solver": r.solver}
    if r.optimal:
        m = r.scenario_results[0]
        out["metrics"] = {k: m[k] for k in KEYS}
        out["duals"] = r.duals
    return _clean(out)


def pmap(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if WORKERS <= 1 or len(jobs) == 1:
        return [_dispatch_job(j) for j in jobs]
    with ProcessPoolExecutor(max_workers=WORKERS) as ex:
        return list(ex.map(_dispatch_job, jobs))


def job(tag: str, scen: str | ScenarioSpec, p: SystemParams, **kw: Any) -> dict[str, Any]:
    spec = PRESETS[scen] if isinstance(scen, str) else scen
    return {"tag": tag, "scenario": spec.model_dump(), "params": p.model_dump(), **kw}


def _check(rows: list[dict[str, Any]], name: str) -> list[str]:
    issues = []
    for r in rows:
        if not r.get("optimal"):
            issues.append(f"{name}:{r.get('tag')} status={r.get('status')}")
        elif r["metrics"]["max_balance_residual_mw"] > 1e-4 or r["metrics"]["max_water_residual_hm3"] > 1e-6:
            issues.append(f"{name}:{r.get('tag')} conservation residual")
    return issues


# ---------------------------------------------------------------------------------------------
# A, B, F (payloads with full time series) + demo week
# ---------------------------------------------------------------------------------------------
def exp_payloads() -> None:
    specs = [("ref-A-normal-annual", "normal"), ("ref-B-moderate-annual", "moderate_drought"),
             ("ref-B-severe-annual", "severe_drought"), ("ref-F-compound-annual", "compound_shock")]
    for rid, sc in specs:
        if cached(rid):
            continue
        d = run_simulation({"scenario": sc, "horizon": {"hours": 8760, "start_day": 0, "resolution_h": 1},
                            "label": f"Reference: {PRESETS[sc].label}, full year hourly, existing fleet"}, run_id=rid)
        save(rid, d)
    for rid, sc in (("ref-E-coordinated-normal", "normal"), ("ref-E-coordinated-severe", "severe_drought")):
        if cached(rid):
            continue
        d = run_simulation({"scenario": sc, "horizon": {"hours": 8760, "start_day": 0, "resolution_h": 1},
                            "system": {"pv_mw": 1300, "wind_mw": 300, "battery_power_mw": 400, "battery_energy_mwh": 1600},
                            "label": f"Reference: coordinated fleet (PV 1300 MW, wind 300 MW, battery 400 MW/1600 MWh), "
                                     f"{PRESETS[sc].label}, full year hourly"}, run_id=rid)
        save(rid, d)
    demo = {"scenario": "normal", "horizon": {"hours": 168, "start_day": 14, "resolution_h": 1},
            "system": {}, "label": "Demo: winter week, normal conditions"}
    if not cached("ref-demo-week"):
        d = run_simulation(demo, run_id="ref-demo-week")
        # verification of the demo sequence (drought, storage) for the video script
        sev = run_simulation({**demo, "scenario": "severe_drought"})
        bat = run_simulation({**demo, "scenario": "severe_drought",
                              "system": {"battery_power_mw": 300, "battery_energy_mwh": 1200}})
        d["demo_verification"] = {
            k: {"objective_keur": x["objective_keur"], "ens_mwh": x["scenarios"][0]["ens_mwh"],
                "imports_mwh": x["scenarios"][0]["imports_mwh"], "seconds": x["solver"]["total_seconds"],
                "status": x["status"], "battery_throughput_mwh": x["scenarios"][0]["battery_throughput_mwh"],
                "price_mean_eur_mwh": x["scenarios"][0]["price_mean_eur_mwh"]}
            for k, x in (("normal", d), ("severe_drought", sev), ("severe_drought_battery_300mw_1200mwh", bat))}
        save("ref-demo-week", d)


# ---------------------------------------------------------------------------------------------
def exp_C() -> None:
    if cached("exp-C"):
        return
    jobs = [job(f"{sc}|pv{pv}", sc, fleet(pv=300 + pv)) for sc in ("normal", "severe_drought")
            for pv in (0, 500, 1000, 1500)]
    rows = pmap(jobs)
    save("exp-C", {"kind": "experiment", "title": "C. Solar additions without batteries",
                   "hypothesis": "Additional PV displaces imports, but without storage its marginal benefit falls as "
                                 "midday curtailment/export saturation grows; the import reduction is larger in drought.",
                   "rows": rows, "issues": _check(rows, "C")})


def exp_D() -> None:
    if cached("exp-D"):
        return
    jobs = [job(f"{sc}|b{bp}/{be}", sc, fleet(bp=bp, be=be)) for sc in ("normal", "severe_drought")
            for bp, be in ((0, 0), (200, 800), (400, 1600), (800, 3200))]
    rows = pmap(jobs)
    save("exp-D", {"kind": "experiment", "title": "D. Battery storage without new renewables",
                   "hypothesis": "In a reservoir-hydro system, batteries mainly provide intra-day arbitrage; without new "
                                 "variable renewables their operational value is modest and does not grow strongly with drought.",
                   "rows": rows, "issues": _check(rows, "D")})


COMBOS = {"baseline": dict(), "pv+1000": dict(pv=1300), "batt400/1600": dict(bp=400, be=1600),
          "pv+1000&batt": dict(pv=1300, bp=400, be=1600), "pv+1000&wind300&batt": dict(pv=1300, wind=300, bp=400, be=1600),
          "pv+1000&wind300": dict(pv=1300, wind=300)}


def exp_E() -> None:
    if cached("exp-E"):
        return
    jobs = [job(f"{sc}|{k}", sc, fleet(**v)) for sc in ("normal", "severe_drought") for k, v in COMBOS.items()]
    rows = pmap(jobs)
    syn = {}
    for sc in ("normal", "severe_drought"):
        g = {r["tag"].split("|")[1]: r for r in rows if r["tag"].startswith(sc + "|") and r["optimal"]}
        if all(k in g for k in ("baseline", "pv+1000", "batt400/1600", "pv+1000&batt")):
            o = {k: g[k]["metrics"]["opex_keur_annualised"] for k in g}
            dpv, db, dboth = o["baseline"] - o["pv+1000"], o["baseline"] - o["batt400/1600"], o["baseline"] - o["pv+1000&batt"]
            cu = {k: g[k]["metrics"]["pv_curtail_mwh"] for k in g}
            syn[sc] = {"opex_saving_pv_keur": dpv, "opex_saving_batt_keur": db, "opex_saving_combined_keur": dboth,
                       "synergy_keur": dboth - dpv - db, "pv_curtail_pv_only_mwh": cu["pv+1000"],
                       "pv_curtail_with_batt_mwh": cu["pv+1000&batt"]}
    save("exp-E", {"kind": "experiment", "title": "E. Coordinated solar, wind, hydro and storage",
                   "hypothesis": "Combining PV with storage yields operating savings larger than the sum of the separate "
                                 "additions (positive synergy) because storage absorbs PV that would otherwise be curtailed or exported cheaply.",
                   "rows": rows, "synergy": syn, "issues": _check(rows, "E")})


def exp_F() -> None:
    if cached("exp-F"):
        return
    jobs = [job(f"price{m}", PRESETS["severe_drought"].model_copy(update={"import_price_multiplier": m}), fleet())
            for m in (1.0, 1.5, 2.0, 2.5, 3.0)]
    jobs += [job(f"avail{a}", PRESETS["severe_drought"].model_copy(update={"import_availability": a, "demand_growth": 0.08}),
                 fleet()) for a in (1.0, 0.75, 0.5, 0.35, 0.25)]
    jobs += [job(f"avail{a}|batt", PRESETS["severe_drought"].model_copy(update={"import_availability": a, "demand_growth": 0.08}),
                 fleet(bp=400, be=1600)) for a in (0.5, 0.35, 0.25)]
    rows = pmap(jobs)
    save("exp-F", {"kind": "experiment", "title": "F. Import price shock and interconnector derating (severe drought)",
                   "hypothesis": "Price shocks raise cost roughly linearly with import volume but do not by themselves "
                                 "cause shortages; shortages appear only when interconnector availability falls below a threshold.",
                   "rows": rows, "issues": _check(rows, "F")})


def exp_G() -> None:
    if cached("exp-G"):
        return
    jobs = [job(f"g{g}|a{a}", PRESETS["severe_drought"].model_copy(update={"demand_growth": g, "import_availability": a}),
                fleet()) for a in (1.0, 0.5) for g in (0.0, 0.1, 0.2, 0.3)]
    rows = pmap(jobs)
    save("exp-G", {"kind": "experiment", "title": "G. Demand growth stress test (severe drought)",
                   "hypothesis": "With full interconnector availability demand growth is absorbed by imports; with "
                                 "halved availability, unserved energy rises non-linearly with demand growth.",
                   "rows": rows, "issues": _check(rows, "G")})


# ---------------------------------------------------------------------------------------------
# H & I: investment planning (representative weeks, hourly, nested seasonal reservoir boundaries)
# ---------------------------------------------------------------------------------------------
def _scen_set() -> list[ScenarioSpec]:
    return stochastic_scenario_set()


def _evaluate_plan(adds: dict[str, float], scen: list[ScenarioSpec]) -> dict[str, Any]:
    p = SystemParams()
    fixed = {"pv": p.pv_existing_mw + adds.get("pv", 0), "wind": p.wind_existing_mw + adds.get("wind", 0),
             "bp": adds.get("bp", 0), "be": adds.get("be", 0)}
    inv = InvestmentOptions(enabled=True, budget_meur=None)
    cfg = RunConfig(scenarios=scen, invest=inv, fixed_capacity=fixed, risk=RiskOptions(alpha=0.9, weight=0.0))
    r, mi, info = run_repweeks(cfg)
    if not r.optimal:
        return {"status": r.status}
    by = {s["key"]: {k: s[k] for k in KEYS if k in s} for s in r.scenario_results}
    exp = {k: float(sum(s["probability"] * s[k] for s in r.scenario_results)) for k in KEYS if k in r.scenario_results[0]}
    return {"status": r.status, "by_scenario": by, "expected": exp, "risk": r.risk,
            "capex_overnight_meur": r.expected["capex_overnight_meur"], "capex_annualised_keur": r.expected["capex_annualised_keur"]}


def _optimise(scen: list[ScenarioSpec], budget: float, lam: float = 0.0, alpha: float = 0.9,
              inv_kw: dict | None = None, p: SystemParams | None = None, c: TechnologyCosts | None = None) -> dict[str, Any]:
    inv = InvestmentOptions(enabled=True, budget_meur=budget, **(inv_kw or {}))
    cfg = RunConfig(scenarios=scen, invest=inv, risk=RiskOptions(alpha=alpha, weight=lam), params=p or SystemParams(),
                    costs=c or TechnologyCosts())
    t0 = time.perf_counter()
    r, mi, info = run_repweeks(cfg)
    return _clean({"status": r.status, "additions": r.additions, "objective_keur": r.objective_keur,
                   "objective_keur_annualised": r.objective_keur / mi.horizon_weight if r.optimal else None,
                   "risk": r.risk, "expected": r.expected, "duals": r.duals, "passes": info["passes"],
                   "seconds": time.perf_counter() - t0, "solver": r.solver,
                   "scenarios": [{k: s[k] for k in ["key", "probability", *KEYS] if k in s} for s in r.scenario_results]})


def exp_H_I() -> None:
    scen = _scen_set()
    normal_only = [next(s for s in scen if s.key == "normal").model_copy(update={"probability": 1.0})]
    # ---- budget sweep (deterministic, normal conditions) -----------------------------------
    sweep = cached("exp-H-budget-sweep")
    if sweep is None:
        rows = []
        for b in (0, 100, 250, 500, 750, 1000, 1500, 2000):
            rows.append({"budget_meur": b, **_optimise(normal_only, b)})
        sweep = save("exp-H-budget-sweep", {"kind": "experiment", "title": "H. Investment planning under capital "
                                            "constraints (deterministic, normal year)", "rows": rows,
                                            "hypothesis": "Under a binding budget the optimiser prioritises the technology "
                                                          "with the highest operating value per euro of overnight capital; "
                                                          "storage enters only once renewable additions create surplus."})
    # ---- stochastic / risk sweep at the reference budget -------------------------------------
    risk_sw = cached("exp-I-risk-sweep")
    if risk_sw is None:
        rows = [{"lambda": lam, **_optimise(scen, BUDGET, lam=lam)} for lam in (0.0, 0.25, 1.0, 4.0)]
        rows += [{"lambda": 0.0, "budget_meur": 1500, **_optimise(scen, 1500, lam=0.0)},
                 {"lambda": 4.0, "budget_meur": 1500, **_optimise(scen, 1500, lam=4.0)}]
        risk_sw = save("exp-I-risk-sweep", {"kind": "experiment", "title": "I. Stochastic and risk-averse planning",
                                           "rows": rows, "alpha": 0.9, "budget_meur": BUDGET})
    if not cached("ref-I-stochastic"):
        d = run_stochastic({"budget_meur": BUDGET, "risk_alpha": 0.9, "risk_lambda": 1.0, "compare_deterministic": True,
                            "n_weeks": 8, "boundary_passes": 1,
                            "label": "Reference: two-stage stochastic plan, CVaR(0.9) weight 1.0, budget 500 MEUR"},
                           run_id="ref-I-stochastic")
        save("ref-I-stochastic", d)
    # ---- strategy comparison & frontier ----------------------------------------------------
    if cached("ref-H-frontier"):
        return
    c = TechnologyCosts()
    over = c.overnight_keur_per_unit()
    pv_only = BUDGET * 1000 / over["pv"]
    wind_only = min(BUDGET * 1000 / over["wind"], 1000)
    b4 = BUDGET * 1000 / (over["battery_power"] + 4 * over["battery_energy"])
    det500 = next(r for r in sweep["rows"] if r["budget_meur"] == BUDGET)
    rob = next(r for r in risk_sw["rows"] if r["lambda"] == 1.0 and "budget_meur" not in r)
    strategies = [
        ("A_baseline", "A. Baseline", "Existing fleet, no investment", "baseline", {}),
        ("B_solar", "B. Solar expansion", f"Entire {BUDGET:.0f} MEUR budget in PV", "solar", {"pv": pv_only}),
        ("C_wind", "C. Wind expansion", f"Entire {BUDGET:.0f} MEUR budget in onshore wind", "wind", {"wind": wind_only}),
        ("D_battery", "D. Battery expansion", f"Entire {BUDGET:.0f} MEUR budget in 4-h batteries", "battery",
         {"bp": b4, "be": 4 * b4}),
        ("E_coordinated", "E. Coordinated (deterministic optimum)",
         "Cost-optimal mix for a normal year under the budget", "coordinated", det500["additions"]),
        ("F_robust", "F. Climate-robust (stochastic, CVaR λ=1)",
         "Two-stage stochastic optimum over 5 inflow/market scenarios with CVaR(0.9)", "robust", rob["additions"]),
    ]
    for r in sweep["rows"]:
        if r["budget_meur"] not in (0, BUDGET) and r["status"] == "Optimal":
            strategies.append((f"S_budget_{int(r['budget_meur'])}", f"Budget {int(r['budget_meur'])} MEUR (det.)",
                               "Deterministic optimum for a normal year at this budget", "budget_sweep", r["additions"]))
    for r in risk_sw["rows"]:
        if r["status"] == "Optimal" and not (r["lambda"] == 1.0 and "budget_meur" not in r):
            b = r.get("budget_meur", BUDGET)
            strategies.append((f"R_l{r['lambda']}_b{int(b)}", f"Stochastic λ={r['lambda']} ({int(b)} MEUR)",
                               "Two-stage stochastic optimum", "robust", r["additions"]))
    out = []
    for sid, name, desc, fam, adds in strategies:
        adds = {k: float(adds.get(k, 0.0) or 0.0) for k in ("pv", "wind", "bp", "be")}
        ev = _evaluate_plan(adds, scen)
        if ev.get("status") != "Optimal":
            continue
        for v in ev["by_scenario"].values():
            v["total_cost_keur_annualised"] = v["opex_keur"] + ev["capex_annualised_keur"]
        e = ev["expected"]
        e["total_cost_keur_annualised"] = e["opex_keur"] + ev["capex_annualised_keur"]
        out.append({"id": sid, "name": name, "description": desc, "family": fam, "additions": adds,
                    "capex_overnight_meur": ev["capex_overnight_meur"], "capex_annualised_keur": ev["capex_annualised_keur"],
                    "by_scenario": ev["by_scenario"], "expected": e,
                    "cvar_opex_keur_annualised": ev["risk"].get("cvar_keur_annualised")})
    for s in out:
        s["cvar_total_keur_annualised"] = (s["cvar_opex_keur_annualised"] or 0.0) + s["capex_annualised_keur"]
    defs = {
        "pareto": lambda s: (s["expected"]["total_cost_keur_annualised"], s["expected"]["imports_mwh"]),
        "pareto_cost_cvar": lambda s: (s["expected"]["total_cost_keur_annualised"], s["cvar_total_keur_annualised"]),
        "pareto_capex_imports": lambda s: (s["capex_overnight_meur"], s["expected"]["imports_mwh"]),
        "pareto_cost_ens": lambda s: (s["expected"]["total_cost_keur_annualised"], s["expected"]["ens_mwh"]),
    }
    for name, fn in defs.items():
        mask = pareto_mask([fn(s) for s in out])
        for s, m in zip(out, mask, strict=True):
            s[name] = bool(m)
    keys = [s.key for s in scen]
    costs = np.array([[s["by_scenario"][k]["total_cost_keur_annualised"] for k in keys] for s in out])
    save("ref-H-frontier", {"kind": "frontier", "evaluation_scenarios": keys,
                            "scenario_probabilities": {s.key: s.probability for s in scen},
                            "strategies": out, "pareto_front": [s["id"] for s in out if s["pareto"]],
                            "pareto_fronts": {k: [s["id"] for s in out if s[k]] for k in defs},
                            "frontier_axes": {"x": "expected total annualised cost (kEUR/yr)",
                                              "y": "expected imports (MWh/yr)"},
                            "pareto_definitions": {
                                "pareto": "min expected total cost, min expected imports",
                                "pareto_cost_cvar": "min expected total cost, min CVaR(0.9) of total cost",
                                "pareto_capex_imports": "min overnight capex, min expected imports",
                                "pareto_cost_ens": "min expected total cost, min expected unserved energy"},
                            "regret_keur": regret_matrix(costs).tolist(),
                            "method": "Every strategy is evaluated with the same representative-week hourly model "
                                      "(8 weeks × 5 scenarios, nested seasonal reservoir boundaries). Metrics annualised."})


def exp_I2() -> None:
    """When does stochastic planning matter? Same comparison with restricted export capacity (PV surplus must be
    stored or curtailed) and a larger budget, so that storage competes with PV."""
    if cached("exp-I2-conditions"):
        return
    scen = _scen_set()
    normal = [next(s for s in scen if s.key == "normal").model_copy(update={"probability": 1.0})]
    rows = []
    for exp_cap, budget in ((300.0, 1000.0), (300.0, 1500.0), (900.0, 1500.0)):
        p = SystemParams(export_capacity_mw=exp_cap)
        det = _optimise(normal, budget, p=p)
        fixed = {k: SystemParams().model_dump().get({"pv": "pv_existing_mw", "wind": "wind_existing_mw",
                                                       "bp": "battery_power_existing_mw",
                                                       "be": "battery_energy_existing_mwh"}[k], 0.0) + det["additions"][k]
                 for k in ("pv", "wind", "bp", "be")}
        for lam in (0.0, 1.0):
            rp = _optimise(scen, budget, lam=lam, p=p)
            inv = InvestmentOptions(enabled=True, budget_meur=budget)
            cfg = RunConfig(scenarios=scen, invest=inv, fixed_capacity=fixed, params=p,
                            risk=RiskOptions(alpha=0.9, weight=lam))
            ev, mi, _ = run_repweeks(cfg)
            w = mi.horizon_weight
            rows.append(_clean({
                "export_capacity_mw": exp_cap, "budget_meur": budget, "lambda": lam,
                "rp_additions": rp["additions"], "det_additions": det["additions"],
                "rp_objective_keur_annualised": rp["objective_keur_annualised"],
                "eev_objective_keur_annualised": ev.objective_keur / w,
                "vss_keur_annualised": ev.objective_keur / w - rp["objective_keur_annualised"],
                "rp_expected_cost_keur_annualised": rp["objective_keur_annualised"] - lam * rp["risk"]["cvar_keur_annualised"],
                "eev_expected_cost_keur_annualised": ev.objective_keur / w - lam * ev.risk["cvar_keur_annualised"],
                "rp_cvar_keur_annualised": rp["risk"]["cvar_keur_annualised"],
                "eev_cvar_keur_annualised": ev.risk["cvar_keur_annualised"],
                "rp_expected_ens_mwh": float(sum(s["probability"] * s["ens_mwh"] for s in rp["scenarios"])),
                "eev_expected_ens_mwh": float(sum(s["probability"] * s["ens_mwh"] for s in ev.scenario_results)),
                "rp_expected_curtailment_mwh": float(sum(s["probability"] * (s["pv_curtail_mwh"] + s["wind_curtail_mwh"])
                                                         for s in rp["scenarios"]))}))
    save("exp-I2-conditions", {"kind": "experiment",
                               "title": "I2. Conditions under which stochastic planning changes the decision",
                               "hypothesis": "When PV surplus cannot be exported, storage value becomes scenario-dependent "
                                             "and the stochastic plan differs from the deterministic plan (VSS > 0).",
                               "rows": rows})


def exp_K() -> None:
    """Re-evaluate key plans with full-year chronological hourly dispatch (no representative-week sampling)."""
    if cached("exp-H-chronological-check"):
        return
    fr = cached("ref-H-frontier")
    if not fr:
        return
    ids = ["A_baseline", "B_solar", "C_wind", "D_battery", "F_robust", "R_l0.0_b500", "S_budget_1500"]
    strat = {s["id"]: s for s in fr["strategies"] if s["id"] in ids}
    scen = _scen_set()
    p0 = SystemParams()
    jobs = []
    for sid, s in strat.items():
        a = s["additions"]
        flt = fleet(pv=p0.pv_existing_mw + a["pv"], wind=p0.wind_existing_mw + a["wind"], bp=a["bp"], be=a["be"])
        for sc in scen:
            jobs.append(job(f"{sid}|{sc.key}", sc.model_copy(update={"probability": 1.0}), flt))
    rows = pmap(jobs)
    by = {r["tag"]: r for r in rows}
    from hydroflex.optimization.model import cvar_discrete

    out = []
    for sid, s in strat.items():
        opex = np.array([by[f"{sid}|{sc.key}"]["metrics"]["opex_keur_annualised"] for sc in scen])
        probs = np.array([sc.probability for sc in scen])
        rk = cvar_discrete(opex, probs, 0.9)
        out.append({"id": sid, "name": s["name"], "capex_annualised_keur": s["capex_annualised_keur"],
                    "chrono_expected_total_keur": float(probs @ opex) + s["capex_annualised_keur"],
                    "chrono_cvar_total_keur": rk["cvar_keur"] + s["capex_annualised_keur"],
                    "repweek_expected_total_keur": s["expected"]["total_cost_keur_annualised"],
                    "repweek_cvar_total_keur": s["cvar_total_keur_annualised"],
                    "chrono_by_scenario_opex_keur": {sc.key: float(v) for sc, v in zip(scen, opex, strict=True)},
                    "repweek_by_scenario_opex_keur": {k: v["opex_keur"] for k, v in s["by_scenario"].items()},
                    "chrono_expected_imports_mwh": float(probs @ np.array([by[f"{sid}|{sc.key}"]["metrics"]["imports_mwh"] for sc in scen])),
                    "chrono_expected_ens_mwh": float(probs @ np.array([by[f"{sid}|{sc.key}"]["metrics"]["ens_mwh"] for sc in scen]))})
    rank_c = [o["id"] for o in sorted(out, key=lambda o: o["chrono_expected_total_keur"])]
    rank_r = [o["id"] for o in sorted(out, key=lambda o: o["repweek_expected_total_keur"])]
    save("exp-H-chronological-check", {"kind": "validation", "title": "Representative-week vs full-year chronological evaluation",
                                       "rows": out, "rank_chronological": rank_c, "rank_representative_weeks": rank_r,
                                       "issues": _check(rows, "K")})


# ---------------------------------------------------------------------------------------------
# J: marginal value of flexibility
# ---------------------------------------------------------------------------------------------
RES_DELTA = {"be": ("battery_energy", "MWh", 100.0), "bp": ("battery_power", "MW", 25.0), "pv": ("solar_pv", "MW", 50.0),
             "wind": ("wind", "MW", 50.0), "imp": ("import_capacity", "MW", 50.0),
             "vmax": ("reservoir_volume", "hm3", 50.0)}


def exp_J() -> None:
    if cached("ref-J-marginal"):
        return
    base = {"pv": 300.0, "wind": 0.0, "bp": 200.0, "be": 800.0, "imp": 900.0, "vmax": 2400.0}
    jobs = []
    for sc in ("normal", "severe_drought", "compound_shock"):
        jobs.append(job(f"{sc}|base", sc, fleet(), fixed=base))
        for k, (_, _, d) in RES_DELTA.items():
            jobs.append(job(f"{sc}|{k}|up", sc, fleet(), fixed={**base, k: base[k] + d}))
            if base[k] - d >= 0:
                jobs.append(job(f"{sc}|{k}|dn", sc, fleet(), fixed={**base, k: base[k] - d}))
    rows = pmap(jobs)
    by = {r["tag"]: r for r in rows}
    ann = TechnologyCosts().annualised_keur_per_unit()
    cost_map = {"be": ann["battery_energy"], "bp": ann["battery_power"], "pv": ann["pv"], "wind": ann["wind"],
                "imp": ann["import_capacity"], "vmax": None}
    out = []
    for sc in ("normal", "severe_drought", "compound_shock"):
        b = by[f"{sc}|base"]
        o0 = b["metrics"]["opex_keur_annualised"]
        for k, (res, unit, d) in RES_DELTA.items():
            up = by[f"{sc}|{k}|up"]["metrics"]["opex_keur_annualised"]
            dn = by.get(f"{sc}|{k}|dn")
            right = (o0 - up) / d
            left = (dn["metrics"]["opex_keur_annualised"] - o0) / d if dn else None
            dual = b["duals"][f"marginal_value_{k}"]
            out.append({"resource": res, "key": k, "unit": unit, "scenario": sc, "base_capacity": base[k], "delta": d,
                        "fd_right_keur_per_unit_yr": right, "fd_left_keur_per_unit_yr": left,
                        "fd_central_keur_per_unit_yr": (right + left) / 2 if left is not None else right,
                        "dual_keur_per_unit_yr": dual["per_unit_annualised_keur"], "dual_reliable": dual["reliable"],
                        "annualised_cost_keur_per_unit_yr": cost_map[k]})
    save("ref-J-marginal", {"kind": "marginal", "rows": out, "base_fleet": base,
                            "method": "Annual hourly dispatch with fixed fleet; finite differences on annualised operating "
                                      "cost; dual = operational part of the reduced cost of the fixed capacity variable.",
                            "issues": _check(rows, "J")})


# ---------------------------------------------------------------------------------------------
# Sensitivity: drought sweep, tornado (re-optimised investment), battery × drought heatmap, robustness
# ---------------------------------------------------------------------------------------------
def exp_sensitivity() -> None:
    if cached("ref-sensitivity"):
        return
    sev = [round(x, 2) for x in np.arange(0.0, 0.61, 0.05)]
    jobs = [job(f"sweep|{a}|{s}", PRESETS["normal"].model_copy(update={"drought_severity": s, "import_availability": a}),
                fleet()) for a in (1.0, 0.5) for s in sev]
    hm_sev, hm_be = (0.0, 0.2, 0.4, 0.6), (0, 400, 800, 1600, 3200)
    jobs += [job(f"hm|{s}|{be}", PRESETS["normal"].model_copy(update={"drought_severity": s, "import_availability": 0.6}),
                 fleet(bp=be / 4, be=be)) for s in hm_sev for be in hm_be]
    rows = pmap(jobs)
    by = {r["tag"]: r for r in rows}
    sweep = []
    for a in (1.0, 0.5):
        for s in sev:
            m = by[f"sweep|{a}|{s}"]["metrics"]
            sweep.append({"severity": s, "import_availability": a, "ens_mwh": m["ens_mwh"], "lol_hours": m["lol_hours"],
                          "imports_mwh": m["imports_mwh"], "net_imports_mwh": m["net_imports_mwh"],
                          "total_cost_keur_annualised": m["total_cost_keur_annualised"],
                          "hydro_mwh": m["hydro_res_mwh"] + m["ror_mwh"], "price_mean_eur_mwh": m["price_mean_eur_mwh"]})
    ann = TechnologyCosts().annualised_keur_per_unit()
    z_net, z_ens = [], []
    for be in hm_be:
        rn, re_ = [], []
        for s in hm_sev:
            m0 = by[f"hm|{s}|0"]["metrics"]
            m = by[f"hm|{s}|{be}"]["metrics"]
            capex = be * ann["battery_energy"] + be / 4 * ann["battery_power"]
            rn.append(m0["opex_keur_annualised"] - m["opex_keur_annualised"] - capex)
            re_.append(m["ens_mwh"])
        z_net.append(rn)
        z_ens.append(re_)
    # tornado: re-optimise investment (deterministic, normal, budget 500) under low/high assumptions
    normal = [PRESETS["normal"]]
    base_p, base_c = SystemParams(), TechnologyCosts()
    tc = TechnologyCosts()
    cases = [
        ("import_price_multiplier", "Import price ×0.7 / ×1.3", 0.7, 1.3, 1.0, lambda v: (base_p.model_copy(update={"import_price_multiplier": v}), base_c, normal)),
        ("demand_multiplier", "Demand ×0.9 / ×1.1", 0.9, 1.1, 1.0, lambda v: (base_p.model_copy(update={"demand_multiplier": v}), base_c, normal)),
        ("drought_severity", "Drought severity 0 / 0.3 (vs normal)", 0.0, 0.3, 0.0, lambda v: (base_p, base_c, [PRESETS["normal"].model_copy(update={"drought_severity": v})])),
        ("battery_cost", "Battery capex ×0.6 / ×1.4", 0.6, 1.4, 1.0, lambda v: (base_p, base_c.model_copy(update={"battery_energy_capex_eur_per_kwh": tc.battery_energy_capex_eur_per_kwh * v, "battery_power_capex_eur_per_kw": tc.battery_power_capex_eur_per_kw * v}), normal)),
        ("pv_capex", "PV capex ×0.7 / ×1.3", 0.7, 1.3, 1.0, lambda v: (base_p, base_c.model_copy(update={"pv_capex_eur_per_kw": tc.pv_capex_eur_per_kw * v}), normal)),
        ("discount_rate", "Discount rate 4% / 10%", 0.04, 0.10, 0.07, lambda v: (base_p, base_c.model_copy(update={"discount_rate": v}), normal)),
        ("export_price_ratio", "Export/import price ratio 0.75 / 0.95", 0.75, 0.95, 0.85, lambda v: (base_p.model_copy(update={"export_price_ratio": v}), base_c, normal)),
        ("import_capacity_mw", "Interconnector NTC 600 / 1200 MW", 600.0, 1200.0, 900.0, lambda v: (base_p.model_copy(update={"import_capacity_mw": v}), base_c, normal)),
        ("voll_eur_mwh", "VOLL 2,000 / 10,000 EUR/MWh", 2000.0, 10000.0, 5000.0, lambda v: (base_p.model_copy(update={"voll_eur_mwh": v}), base_c, normal)),
    ]
    base_run = _optimise(normal, BUDGET)
    tornado = []
    for key, label, lo, hi, bv, f in cases:
        res = {}
        for tagv, v in (("low", lo), ("high", hi)):
            p, c, sc = f(v)
            res[tagv] = _optimise([s.model_copy(update={"probability": 1.0}) for s in sc], BUDGET, p=p, c=c)
        tornado.append({"parameter": key, "label": label, "low_value": lo, "high_value": hi, "base_value": bv,
                        "metric_low": res["low"]["objective_keur_annualised"], "metric_high": res["high"]["objective_keur_annualised"],
                        "metric_base": base_run["objective_keur_annualised"], "additions_low": res["low"]["additions"],
                        "additions_high": res["high"]["additions"], "additions_base": base_run["additions"]})
    fr = cached("ref-H-frontier")
    robust = None
    if fr:
        robust = {"strategies": [s["id"] for s in fr["strategies"]], "strategy_names": [s["name"] for s in fr["strategies"]],
                  "scenarios": fr["evaluation_scenarios"], "regret_keur": fr["regret_keur"]}
    save("ref-sensitivity", {"kind": "sensitivity", "metric": "objective_keur_annualised",
                             "metric_label": "optimal annualised system cost after re-optimising investment (kEUR/yr), "
                                             "budget 500 MEUR, normal year, representative weeks",
                             "tornado": tornado, "drought_sweep": sweep,
                             "heatmap": {"metric": "net annual benefit of 4-h battery (opex saving − annualised capex), kEUR/yr; "
                                                   "import availability 0.6",
                                         "x_label": "drought severity", "y_label": "battery energy (MWh), P = E/4",
                                         "x": list(hm_sev), "y": list(hm_be), "z": z_net, "z_ens_mwh": z_ens},
                             "robustness": robust, "issues": _check(rows, "sensitivity")})


# ---------------------------------------------------------------------------------------------
def exp_resolution() -> None:
    if cached("exp-resolution"):
        return
    jobs = [job(f"res{r}", "normal", fleet(bp=400, be=1600), res=r) for r in (1, 2, 3, 6)]
    jobs += [job(f"res{r}|nobatt", "normal", fleet(), res=r) for r in (1, 2, 3, 6)]
    rows = pmap(jobs)
    save("exp-resolution", {"kind": "experiment", "title": "Temporal-resolution sensitivity",
                            "hypothesis": "Coarser time steps average out intra-day price and PV variation and therefore "
                                          "understate the operating value of short-duration storage.", "rows": rows,
                            "issues": _check(rows, "resolution")})


def exp_validation() -> None:
    if cached("exp-validation"):
        return
    from hydroflex.optimization.model import solve
    from hydroflex.optimization.pypsa_model import solve_pypsa
    from hydroflex.optimization.runner import make_input

    p = SystemParams(min_release_m3s=0, res_terminal="eq", battery_terminal="cyclic", battery_power_existing_mw=200,
                     battery_energy_existing_mwh=800)
    rows = []
    for sc, hours, start, invest in (("normal", 168, 200, False), ("severe_drought", 168, 200, False),
                                     ("compound_shock", 168, 200, True), ("normal", 720, 30, False),
                                     ("severe_drought", 720, 210, True)):
        cfg = RunConfig(scenarios=[PRESETS[sc]], params=p, hours=hours, start_hour=start * 24,
                        invest=InvestmentOptions(enabled=invest, battery_power_max_mw=0, battery_energy_max_mwh=0))
        mi, _, _ = make_input(cfg)
        t0 = time.perf_counter()
        r = solve(mi)
        tn = time.perf_counter() - t0
        q = solve_pypsa(mi, pv_extendable=invest, wind_extendable=invest)
        m = r.scenario_results[0]
        rows.append({"scenario": sc, "hours": hours, "start_day": start, "investment": invest,
                     "native_objective_keur": r.objective_keur, "pypsa_objective_keur": q["objective_keur"],
                     "rel_diff": abs(r.objective_keur - q["objective_keur"]) / max(1.0, abs(r.objective_keur)),
                     "native_seconds": tn, "pypsa_seconds": q["seconds"],
                     "native_imports_mwh": m["imports_mwh"], "pypsa_imports_mwh": q["imports_mwh"],
                     "native_pv_mw": r.capacities["pv"], "pypsa_pv_mw": q["pv_p_nom"],
                     "native_wind_mw": r.capacities["wind"], "pypsa_wind_mw": q["wind_p_nom"],
                     "reservoir_max_abs_diff_hm3": float(np.max(np.abs(r.timeseries[sc]["reservoir_hm3"] - q["reservoir_hm3"]))),
                     "price_max_abs_diff_eur_mwh": float(np.max(np.abs(r.timeseries[sc]["price_eur_mwh"] - q["marginal_price_eur_mwh"])))})
    save("exp-validation", {"kind": "validation", "title": "Independent verification: native LP vs PyPSA/linopy",
                            "rows": rows, "note": "Dispatch of an LP need not be unique; objective values must agree."})


# ---------------------------------------------------------------------------------------------
def manifest() -> None:
    import highspy
    import pandas
    import pypsa
    import scipy

    try:
        commit = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True,
                                timeout=10).stdout.strip()
    except Exception:
        commit = ""
    (OUT / "manifest.json").write_text(json.dumps({
        "created_utc": _now(), "hydroflex": __version__, "python": platform.python_version(),
        "platform": platform.platform(), "numpy": np.__version__, "pandas": pandas.__version__, "scipy": scipy.__version__,
        "highspy": getattr(highspy, "__version__", ""), "pypsa": pypsa.__version__, "git_commit": commit,
        "random_seeds": {"profiles": f"{SEED} + year", "synthetic_fallback": 7}, "timings_s": TIMINGS,
        "workers": WORKERS, "data_label": DATA_NOTE, "synthetic_label": SYNTHETIC_LABEL}, indent=2), encoding="utf-8")


STAGES = {"A": exp_payloads, "C": exp_C, "D": exp_D, "E": exp_E, "F": exp_F, "G": exp_G, "H": exp_H_I, "I2": exp_I2, "K": exp_K,
          "J": exp_J, "S": exp_sensitivity, "R": exp_resolution, "V": exp_validation}


def main() -> None:
    global FORCE
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    FORCE = a.force
    sel = [s for s in (a.only.split(",") if a.only else STAGES)]
    for k in sel:
        t0 = time.perf_counter()
        print(f"[{_now()}] stage {k} ...", flush=True)
        STAGES[k]()
        TIMINGS[k] = round(time.perf_counter() - t0, 1)
        print(f"[{_now()}] stage {k} done in {TIMINGS[k]} s", flush=True)
    manifest()
    from hydroflex.experiments import figures, policy_brief, summary, tables

    summary.main()
    policy_brief.main()
    tables.main()
    figures.main()


if __name__ == "__main__":
    main()
