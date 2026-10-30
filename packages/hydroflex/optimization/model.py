r"""HydroFlex native LP: dispatch, capacity expansion and two-stage stochastic planning with CVaR.

Formulation (all costs in kEUR, energies in MWh, powers in MW, volumes in hm3, step length Δt h):

First stage (shared by all scenarios s):
    K = {pv, wind, bp (battery power), be (battery energy), imp (import NTC), vmax (reservoir max volume)}
    x_k ∈ [x_k^0, x_k^0 + \bar{x}_k]  (investment mode)   or   x_k = x_k^0 (dispatch mode)

Second stage, for every scenario s and step t:
    balance      g^pv + g^w + g^ror + h + d + m + u - c - y = D_{s,t}               (dual: price)
    PV / wind    g^pv <= f^pv_t x_pv,   g^w <= f^w_t x_w      (curtailment = available - g)
    ROR          0 <= g^ror <= R_{s,t}
    hydro        0 <= h <= P^h,   V_{t+1} = V_t + Δt (I_{s,t} - h/κ - σ)
                 V^min <= V_t <= x_vmax,   h/κ + σ >= r^min,   V_0 fixed,  V_T >= V_0 (or = V_0)
    battery      e_{t+1} = e_t + Δt (η^c c - d/η^d),  c, d <= x_bp,  ε x_be <= e_t <= x_be
                 e_0 = s_0 x_be and e_T >= e_0      (or cyclic: e_T = e_0, e_0 free)
    imports      0 <= m <= a_s x_imp,   0 <= y <= Y
    shortage     0 <= u <= D_{s,t}

Objective:
    min  w Σ_k A_k x_k  +  Σ_s π_s L_s  +  λ [ ζ + 1/(1-α) Σ_s π_s φ_s ]
    L_s = Σ_t Δt (p^m m - p^y y + VOLL u + c^h h + c^deg d) / 1000,
    φ_s >= L_s - ζ,  φ_s >= 0          (Rockafellar–Uryasev CVaR linearisation)
    w = T Δt / 8760 scales annualised capital costs to the modelled horizon.

Budget:  Σ_k C_k (x_k - x_k^0) <= B   (overnight capital, MEUR -> kEUR)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts
from hydroflex.optimization.lp import INF, LP, LPSolution

CAP_KEYS = ("pv", "wind", "bp", "be", "imp", "vmax")
INVESTABLE = ("pv", "wind", "bp", "be")
COST_KEY = {"pv": "pv", "wind": "wind", "bp": "battery_power", "be": "battery_energy", "imp": "import_capacity"}


@dataclass
class ScenarioData:
    key: str
    label: str
    probability: float
    demand: np.ndarray
    pv_cf: np.ndarray
    wind_cf: np.ndarray
    ror_avail: np.ndarray
    inflow: np.ndarray              # hm3/h
    import_price: np.ndarray        # EUR/MWh
    import_availability: float = 1.0
    export_price_ratio: float = 0.85
    v0_hm3: float | None = None          # per-scenario boundary (nested runs); overrides ModelInput
    v_terminal_hm3: float | None = None

    @classmethod
    def from_frame(cls, df: pd.DataFrame, key: str, label: str, probability: float,
                   p: SystemParams) -> ScenarioData:
        avail = float(df["import_availability"].iloc[0]) if "import_availability" in df else 1.0
        return cls(
            key=key, label=label, probability=probability,
            demand=df["demand_mw"].to_numpy(float) * p.demand_multiplier,
            pv_cf=df["pv_cf"].to_numpy(float), wind_cf=df["wind_cf"].to_numpy(float),
            ror_avail=np.minimum(df["ror_avail_mw"].to_numpy(float), p.ror_p_mw),
            inflow=df["drin_inflow_hm3_per_h"].to_numpy(float),
            import_price=df["import_price_eur_mwh"].to_numpy(float) * p.import_price_multiplier,
            import_availability=avail * p.import_availability,
            export_price_ratio=p.export_price_ratio,
        )


@dataclass
class RiskOptions:
    alpha: float = 0.95
    weight: float = 0.0  # λ


@dataclass
class ModelInput:
    params: SystemParams
    costs: TechnologyCosts
    invest: InvestmentOptions
    scenarios: list[ScenarioData]
    dt: float = 1.0
    timestamps: pd.DatetimeIndex | None = None
    risk: RiskOptions = field(default_factory=RiskOptions)
    v0_hm3: float | None = None
    v_terminal_hm3: float | None = None
    fixed_capacity: dict[str, float] | None = None  # overrides first stage (e.g. evaluate a plan)
    time_limit: float = 120.0

    @property
    def T(self) -> int:
        return len(self.scenarios[0].demand)

    @property
    def horizon_weight(self) -> float:
        return self.T * self.dt / 8760.0


@dataclass
class ModelResult:
    status: str
    optimal: bool
    objective_keur: float
    capacities: dict[str, float]
    additions: dict[str, float]
    scenario_results: list[dict[str, Any]]
    expected: dict[str, float]
    risk: dict[str, float]
    duals: dict[str, Any]
    solver: dict[str, Any]
    warnings: list[str]
    timeseries: dict[str, dict[str, np.ndarray]]

    def summary(self) -> dict[str, Any]:
        return {"status": self.status, "optimal": self.optimal, "objective_keur": self.objective_keur,
                "capacities": self.capacities, "additions": self.additions, "expected": self.expected,
                "risk": self.risk, "solver": self.solver, "warnings": self.warnings,
                "scenarios": [{k: v for k, v in r.items()} for r in self.scenario_results]}


def _existing(p: SystemParams) -> dict[str, float]:
    return {"pv": p.pv_existing_mw, "wind": p.wind_existing_mw, "bp": p.battery_power_existing_mw,
            "be": p.battery_energy_existing_mwh, "imp": p.import_capacity_mw, "vmax": p.res_vmax_hm3}


def build(mi: ModelInput) -> tuple[LP, dict[str, Any]]:
    p, c, inv = mi.params, mi.costs, mi.invest
    T, dt, S = mi.T, mi.dt, len(mi.scenarios)
    w = mi.horizon_weight
    ann = c.annualised_keur_per_unit()
    over = c.overnight_keur_per_unit()
    ex = _existing(p)
    kappa = p.mwh_per_hm3
    lp = LP()
    ix: dict[str, Any] = {"T": T, "S": S}

    # ---------------- first stage ------------------------------------------------------------
    maxadd = {"pv": inv.pv_max_mw, "wind": inv.wind_max_mw, "bp": inv.battery_power_max_mw,
              "be": inv.battery_energy_max_mwh}
    cap = {}
    for k in CAP_KEYS:
        lo = hi = ex[k]
        if inv.enabled and k in INVESTABLE:
            hi = ex[k] + maxadd[k]
        if mi.fixed_capacity and k in mi.fixed_capacity:
            lo = hi = float(mi.fixed_capacity[k])
        cost = w * ann[COST_KEY[k]] if k in INVESTABLE else 0.0
        cap[k] = lp.var(f"cap_{k}", 1, lb=lo, ub=hi, cost=cost)[0]
        lp.c0 -= cost * ex[k]  # existing fleet is sunk: only additions are costed
    ix["cap"] = cap
    if inv.enabled and not mi.fixed_capacity:
        if inv.budget_meur is not None:
            # Σ C_k x_k <= B + Σ C_k x_k^0  (only additions consume the budget)
            offset = sum(over[COST_KEY[k]] * ex[k] for k in INVESTABLE)
            r = lp.rows_block("budget", 1, -INF, inv.budget_meur * 1000.0 + offset)
            for k in INVESTABLE:
                lp.coef(r, cap[k], over[COST_KEY[k]])
            ix["budget_row"] = int(r[0])
        r = lp.rows_block("duration", 1, -INF, 0.0)
        lp.coef(r, cap["be"], 1.0)
        lp.coef(r, cap["bp"], -inv.battery_max_duration_h)
        ix["duration_row"] = int(r[0])

    # ---------------- second stage -----------------------------------------------------------
    v0_default = mi.v0_hm3 if mi.v0_hm3 is not None else p.res_vmin_hm3 + p.res_v0_frac * (p.res_vmax_hm3 - p.res_vmin_hm3)
    sc_ix = []
    risk_on = mi.risk.weight > 0 and S > 1
    if risk_on:
        zeta = lp.var("cvar_zeta", 1, lb=-INF, ub=INF, cost=mi.risk.weight)[0]
        ix["zeta"] = zeta
    for si, s in enumerate(mi.scenarios):
        pre = f"s{si}_"
        pi = s.probability
        cost_w = pi * dt / 1000.0  # EUR -> kEUR, probability weighted
        D = s.demand
        v0 = s.v0_hm3 if s.v0_hm3 is not None else v0_default
        v = {}
        v["pv"] = lp.var(pre + "pv", T)
        v["wind"] = lp.var(pre + "wind", T)
        v["ror"] = lp.var(pre + "ror", T, ub=s.ror_avail)
        v["hydro"] = lp.var(pre + "hydro", T, ub=p.hydro_res_p_mw, cost=cost_w * p.hydro_vom_eur_mwh)
        v["spill"] = lp.var(pre + "spill", T)
        v["V"] = lp.var(pre + "V", T + 1, lb=p.res_vmin_hm3)
        v["ch"] = lp.var(pre + "ch", T)
        v["dis"] = lp.var(pre + "dis", T, cost=cost_w * p.battery_degradation_eur_mwh)
        v["soc"] = lp.var(pre + "soc", T + 1)
        v["imp"] = lp.var(pre + "imp", T, cost=cost_w * s.import_price)
        v["exp"] = lp.var(pre + "exp", T, ub=p.export_capacity_mw,
                          cost=-cost_w * s.import_price * s.export_price_ratio)
        v["ens"] = lp.var(pre + "ens", T, ub=D, cost=cost_w * p.voll_eur_mwh)
        lp.fix(v["V"][0], v0)

        rows = {}
        # balance
        rb = lp.rows_block(pre + "balance", T, D, D)
        for k, sign in (("pv", 1), ("wind", 1), ("ror", 1), ("hydro", 1), ("dis", 1), ("imp", 1), ("ens", 1),
                        ("ch", -1), ("exp", -1)):
            lp.coef(rb, v[k], float(sign))
        rows["balance"] = rb
        # renewable availability
        for k, cf in (("pv", s.pv_cf), ("wind", s.wind_cf)):
            r = lp.rows_block(pre + f"{k}_avail", T, -INF, 0.0)
            lp.coef(r, v[k], 1.0)
            lp.coef(r, cap[k], -cf)
            rows[f"{k}_avail"] = r
        # reservoir water balance: V[t+1] - V[t] + dt*h/kappa + dt*spill = dt*inflow
        r = lp.rows_block(pre + "water", T, dt * s.inflow, dt * s.inflow)
        lp.coef(r, v["V"][1:], 1.0)
        lp.coef(r, v["V"][:-1], -1.0)
        lp.coef(r, v["hydro"], dt / kappa)
        lp.coef(r, v["spill"], dt)
        rows["water"] = r
        r = lp.rows_block(pre + "vmax", T + 1, -INF, 0.0)
        lp.coef(r, v["V"], 1.0)
        lp.coef(r, cap["vmax"], -1.0)
        rows["vmax"] = r
        if p.min_release_hm3_per_h > 0:
            r = lp.rows_block(pre + "minrel", T, p.min_release_hm3_per_h, INF)
            lp.coef(r, v["hydro"], 1.0 / kappa)
            lp.coef(r, v["spill"], 1.0)
            rows["minrel"] = r
        vt_target = s.v_terminal_hm3 if s.v_terminal_hm3 is not None else (
            mi.v_terminal_hm3 if mi.v_terminal_hm3 is not None else v0)
        if p.res_terminal == "geq":
            r = lp.rows_block(pre + "vterm", 1, vt_target, INF)
            lp.coef(r, v["V"][T], 1.0)
            rows["vterm"] = r
        elif p.res_terminal == "eq":
            r = lp.rows_block(pre + "vterm", 1, vt_target, vt_target)
            lp.coef(r, v["V"][T], 1.0)
            rows["vterm"] = r
        # battery
        r = lp.rows_block(pre + "soc_dyn", T, 0.0, 0.0)
        lp.coef(r, v["soc"][1:], 1.0)
        lp.coef(r, v["soc"][:-1], -1.0)
        lp.coef(r, v["ch"], -dt * p.battery_eta_charge)
        lp.coef(r, v["dis"], dt / p.battery_eta_discharge)
        rows["soc_dyn"] = r
        for k in ("ch", "dis"):
            r = lp.rows_block(pre + f"{k}_cap", T, -INF, 0.0)
            lp.coef(r, v[k], 1.0)
            lp.coef(r, cap["bp"], -1.0)
            rows[f"{k}_cap"] = r
        r = lp.rows_block(pre + "soc_max", T + 1, -INF, 0.0)
        lp.coef(r, v["soc"], 1.0)
        lp.coef(r, cap["be"], -1.0)
        rows["soc_max"] = r
        r = lp.rows_block(pre + "soc_min", T + 1, 0.0, INF)
        lp.coef(r, v["soc"], 1.0)
        lp.coef(r, cap["be"], -p.battery_soc_min_frac)
        rows["soc_min"] = r
        if p.battery_terminal == "geq":
            r = lp.rows_block(pre + "soc0", 1, 0.0, 0.0)
            lp.coef(r, v["soc"][0], 1.0)
            lp.coef(r, cap["be"], -p.battery_soc0_frac)
            r2 = lp.rows_block(pre + "socT", 1, 0.0, INF)
            lp.coef(r2, v["soc"][T], 1.0)
            lp.coef(r2, v["soc"][0], -1.0)
        else:
            r2 = lp.rows_block(pre + "socT", 1, 0.0, 0.0)
            lp.coef(r2, v["soc"][T], 1.0)
            lp.coef(r2, v["soc"][0], -1.0)
        # imports
        r = lp.rows_block(pre + "imp_cap", T, -INF, 0.0)
        lp.coef(r, v["imp"], 1.0)
        lp.coef(r, cap["imp"], -s.import_availability)
        rows["imp_cap"] = r
        # CVaR excess: phi_s - L_s + zeta >= 0
        if risk_on:
            phi = lp.var(pre + "cvar_phi", 1, cost=mi.risk.weight * pi / (1 - mi.risk.alpha))[0]
            r = lp.rows_block(pre + "cvar", 1, 0.0, INF)
            lp.coef(r, phi, 1.0)
            lp.coef(r, ix["zeta"], 1.0)
            unit = dt / 1000.0
            lp.coef(r, v["imp"], -unit * s.import_price)
            lp.coef(r, v["exp"], unit * s.import_price * s.export_price_ratio)
            lp.coef(r, v["ens"], -unit * p.voll_eur_mwh)
            lp.coef(r, v["hydro"], -unit * p.hydro_vom_eur_mwh)
            lp.coef(r, v["dis"], -unit * p.battery_degradation_eur_mwh)
            v["cvar_phi"] = np.array([phi])
            rows["cvar"] = r
        sc_ix.append({"v": v, "rows": rows, "v0": v0, "vt": vt_target})
    ix["scen"] = sc_ix
    return lp, ix


def _scenario_metrics(mi: ModelInput, s: ScenarioData, x: np.ndarray, v: dict, sol: LPSolution, rows: dict,
                      capv: dict[str, float]) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    p, dt = mi.params, mi.dt
    g = {k: x[idx] for k, idx in v.items()}
    D = s.demand
    pv_av = s.pv_cf * capv["pv"]
    w_av = s.wind_cf * capv["wind"]
    exp_price = s.import_price * s.export_price_ratio
    E = lambda a: float(np.sum(a) * dt)  # noqa: E731
    supply = g["pv"] + g["wind"] + g["ror"] + g["hydro"] + g["dis"] + g["imp"] + g["ens"]
    residual = supply - D - g["ch"] - g["exp"]
    soc_res = g["soc"][1:] - g["soc"][:-1] - dt * (p.battery_eta_charge * g["ch"] - g["dis"] / p.battery_eta_discharge)
    water_res = g["V"][1:] - g["V"][:-1] - dt * (s.inflow - g["hydro"] / p.mwh_per_hm3 - g["spill"])
    opex_terms = {
        "import_cost_keur": E(s.import_price * g["imp"]) / 1000,
        "export_revenue_keur": E(exp_price * g["exp"]) / 1000,
        "unserved_penalty_keur": E(p.voll_eur_mwh * g["ens"]) / 1000,
        "hydro_vom_keur": E(p.hydro_vom_eur_mwh * g["hydro"]) / 1000,
        "battery_degradation_keur": E(p.battery_degradation_eur_mwh * g["dis"]) / 1000,
    }
    opex = (opex_terms["import_cost_keur"] - opex_terms["export_revenue_keur"] + opex_terms["unserved_penalty_keur"]
            + opex_terms["hydro_vom_keur"] + opex_terms["battery_degradation_keur"])
    bal_dual = sol.row_dual[rows["balance"]]
    weight = max(s.probability, 1e-12) * dt / 1000.0
    price = bal_dual / weight  # EUR/MWh
    demand_mwh = E(D)
    ens_mwh = E(g["ens"])
    imp_mwh = E(g["imp"])
    exp_mwh = E(g["exp"])
    re_gen = E(g["pv"] + g["wind"] + g["ror"] + g["hydro"])
    thru = E(g["dis"])
    hours = len(D) * dt
    sim = E(np.minimum(g["ch"], g["dis"]))
    metrics = {
        "key": s.key, "label": s.label, "probability": s.probability,
        "demand_mwh": demand_mwh, "served_mwh": demand_mwh - ens_mwh, "ens_mwh": ens_mwh,
        "ens_share": ens_mwh / demand_mwh if demand_mwh > 0 else 0.0,
        "lol_hours": float(np.sum(g["ens"] > 1e-3) * dt),
        "lolp": float(np.mean(g["ens"] > 1e-3)),
        "peak_shortfall_mw": float(np.max(g["ens"])) if len(D) else 0.0,
        "imports_mwh": imp_mwh, "exports_mwh": exp_mwh, "net_imports_mwh": imp_mwh - exp_mwh,
        "import_share": imp_mwh / demand_mwh if demand_mwh > 0 else 0.0,
        "import_cap_binding_hours": float(np.sum(g["imp"] >= capv["imp"] * s.import_availability - 1e-3) * dt)
        if capv["imp"] > 0 else 0.0,
        "pv_mwh": E(g["pv"]), "wind_mwh": E(g["wind"]), "ror_mwh": E(g["ror"]), "hydro_res_mwh": E(g["hydro"]),
        "pv_curtail_mwh": E(pv_av - g["pv"]), "wind_curtail_mwh": E(w_av - g["wind"]),
        "ror_spill_mwh": E(s.ror_avail - g["ror"]),
        "curtailment_share": E(pv_av + w_av - g["pv"] - g["wind"]) / max(E(pv_av + w_av), 1e-9),
        "res_spill_hm3": E(g["spill"]), "res_inflow_hm3": E(s.inflow), "res_release_hm3": E(g["hydro"] / p.mwh_per_hm3),
        "res_v_start_hm3": float(g["V"][0]), "res_v_end_hm3": float(g["V"][-1]),
        "res_v_min_hm3": float(g["V"].min()), "res_hours_at_min": float(np.sum(g["V"][1:] <= p.res_vmin_hm3 + 1e-3) * dt),
        "battery_throughput_mwh": thru,
        "battery_cycles": thru / capv["be"] if capv["be"] > 1e-6 else 0.0,
        "battery_utilisation": float(np.mean((g["ch"] + g["dis"]) > 1e-3)) if capv["bp"] > 1e-6 else 0.0,
        "battery_losses_mwh": E(g["ch"]) - thru + float(g["soc"][0] - g["soc"][-1]),
        "simultaneous_ch_dis_mwh": sim,
        "renewable_generation_mwh": re_gen,
        "domestic_supply_share": 1 - (imp_mwh + ens_mwh) / demand_mwh if demand_mwh > 0 else 1.0,
        "renewable_share_of_generation": 1.0,  # no thermal units in the modelled fleet
        "opex_keur": opex, **opex_terms,
        "opex_keur_annualised": opex * 8760.0 / hours,
        "price_mean_eur_mwh": float(np.mean(price)) if np.all(np.isfinite(price)) else float("nan"),
        "price_max_eur_mwh": float(np.max(price)) if np.all(np.isfinite(price)) else float("nan"),
        "max_balance_residual_mw": float(np.max(np.abs(residual))),
        "max_soc_residual_mwh": float(np.max(np.abs(soc_res))) if len(soc_res) else 0.0,
        "max_water_residual_hm3": float(np.max(np.abs(water_res))) if len(water_res) else 0.0,
    }
    ts = {
        "demand": D, "pv": g["pv"], "wind": g["wind"], "ror": g["ror"], "hydro": g["hydro"],
        "battery_discharge": g["dis"], "battery_charge": g["ch"], "imports": g["imp"], "exports": g["exp"],
        "unserved": g["ens"], "pv_available": pv_av, "wind_available": w_av, "ror_available": s.ror_avail,
        "pv_curtailed": pv_av - g["pv"], "wind_curtailed": w_av - g["wind"],
        "reservoir_hm3": g["V"][1:], "inflow_hm3_h": s.inflow, "release_hm3_h": g["hydro"] / p.mwh_per_hm3,
        "spill_hm3_h": g["spill"], "soc_mwh": g["soc"][1:], "price_eur_mwh": price,
        "import_price": s.import_price,
    }
    return metrics, ts


def solve(mi: ModelInput, keep_timeseries: bool = True) -> ModelResult:
    t0 = time.perf_counter()
    if abs(sum(s.probability for s in mi.scenarios) - 1.0) > 1e-6:
        raise ValueError("scenario probabilities must sum to 1")
    lp, ix = build(mi)
    method = "ipm" if (mi.invest.enabled and not mi.fixed_capacity) or len(mi.scenarios) > 1 else "choose"
    sol = lp.solve(time_limit=mi.time_limit, method=method)
    warnings: list[str] = []
    solver = {"name": "HiGHS", "version": sol.solver_version, "status": sol.status, "method": method,
              "solve_seconds": round(sol.solve_seconds, 3), "build_seconds": round(sol.build_seconds, 3),
              "total_seconds": round(time.perf_counter() - t0, 3), "iterations": sol.iterations,
              "n_vars": sol.n_vars, "n_rows": sol.n_rows, "n_nonzeros": sol.n_nonzeros}
    ex = _existing(mi.params)
    if not sol.optimal:
        msg = {"Infeasible": "The constraint set admits no solution (e.g. minimum release or terminal reservoir "
                             "requirement cannot be met, or bounds conflict).",
               "Time limit reached": "Solver time limit reached before optimality."}.get(sol.status, sol.status)
        warnings.append(msg)
        return ModelResult(status=sol.status, optimal=False, objective_keur=float("nan"), capacities={},
                           additions={}, scenario_results=[], expected={}, risk={}, duals={}, solver=solver,
                           warnings=warnings, timeseries={})
    x = sol.x
    capv = {k: float(x[i]) for k, i in ix["cap"].items()}
    adds = {k: capv[k] - ex[k] for k in INVESTABLE}
    ann = mi.costs.annualised_keur_per_unit()
    over = mi.costs.overnight_keur_per_unit()
    capex_h = sum(mi.horizon_weight * ann[COST_KEY[k]] * adds[k] for k in INVESTABLE)
    scen_res, tss = [], {}
    for si, s in enumerate(mi.scenarios):
        m, ts = _scenario_metrics(mi, s, x, ix["scen"][si]["v"], sol, ix["scen"][si]["rows"], capv)
        m["capex_keur"] = capex_h
        m["total_cost_keur"] = capex_h + m["opex_keur"]
        m["total_cost_keur_annualised"] = m["total_cost_keur"] / mi.horizon_weight
        m["cost_per_mwh_served_eur"] = (m["total_cost_keur"] * 1000 / m["served_mwh"]) if m["served_mwh"] > 0 else float("nan")
        scen_res.append(m)
        if keep_timeseries:
            tss[s.key] = ts
        if m["max_balance_residual_mw"] > 1e-4:
            warnings.append(f"{s.key}: energy-balance residual {m['max_balance_residual_mw']:.2e} MW")
        if m["simultaneous_ch_dis_mwh"] > 1e-3 * max(m["battery_throughput_mwh"], 1.0):
            warnings.append(f"{s.key}: {m['simultaneous_ch_dis_mwh']:.1f} MWh simultaneous charge/discharge "
                            "(LP relaxation; energy dissipation through storage losses)")
    probs = np.array([r["probability"] for r in scen_res])
    keys = [k for k, val in scen_res[0].items() if isinstance(val, float) and k != "probability"]
    expected = {k: float(np.dot(probs, [r[k] for r in scen_res])) for k in keys}
    losses = np.array([r["opex_keur"] for r in scen_res])
    alpha = mi.risk.alpha
    risk = {"alpha": alpha, "lambda": mi.risk.weight, **cvar_discrete(losses, probs, alpha)}
    if "zeta" in ix:
        risk["zeta_lp_keur"] = float(x[ix["zeta"]])
    # duals / marginal values
    duals: dict[str, Any] = {}
    cd = sol.col_dual
    c_full = np.concatenate(lp._c)
    rd = sol.row_dual
    first_stage = {k: 0.0 for k in CAP_KEYS}
    if "budget_row" in ix:
        for k in INVESTABLE:
            first_stage[k] += over[COST_KEY[k]] * rd[ix["budget_row"]]
    if "duration_row" in ix:
        first_stage["be"] += rd[ix["duration_row"]]
        first_stage["bp"] += -mi.invest.battery_max_duration_h * rd[ix["duration_row"]]
    for k, i in ix["cap"].items():
        # HiGHS: reduced cost d = c - A^T y. Operational value of one more unit of x_k is
        # -d(opex)/dx_k = (A^T y)_k restricted to second-stage rows = c_k - d_k - (first-stage rows)_k.
        op_val = (c_full[i] - cd[i]) - first_stage[k]
        duals[f"marginal_value_{k}"] = {"per_unit_horizon_keur": float(op_val),
                                        "per_unit_annualised_keur": float(op_val / mi.horizon_weight),
                                        "reduced_cost_keur": float(cd[i])}
    if "budget_row" in ix:
        bd = float(sol.row_dual[ix["budget_row"]])
        duals["budget_shadow_price"] = {"keur_per_keur_overnight_horizon": -bd,
                                        "binding": bool(sum(over[COST_KEY[k]] * adds[k] for k in INVESTABLE)
                                                        >= (mi.invest.budget_meur or 0) * 1000 - 1e-3)}
    capex_overnight = sum(over[COST_KEY[k]] * adds[k] for k in INVESTABLE) / 1000.0
    expected["capex_overnight_meur"] = capex_overnight
    expected["capex_annualised_keur"] = capex_h / mi.horizon_weight
    return ModelResult(status=sol.status, optimal=True, objective_keur=float(sol.objective), capacities=capv,
                       additions=adds, scenario_results=scen_res, expected=expected, risk=risk, duals=duals,
                       solver=solver, warnings=warnings, timeseries=tss)


def cvar_discrete(losses: np.ndarray, probs: np.ndarray, alpha: float) -> dict[str, float]:
    """Exact VaR/CVaR of a discrete loss distribution (Rockafellar–Uryasev definition)."""
    order = np.argsort(losses)
    l, p = losses[order], probs[order]
    cum = np.cumsum(p)
    k = int(np.searchsorted(cum, alpha - 1e-12))
    k = min(k, len(l) - 1)
    var = float(l[k])
    cvar = var + float(np.sum(p * np.maximum(l - var, 0.0))) / (1 - alpha) if alpha < 1 else float(l.max())
    return {"var_keur": var, "cvar_keur": cvar, "expected_loss_keur": float(np.dot(probs, losses)),
            "worst_loss_keur": float(l.max())}
