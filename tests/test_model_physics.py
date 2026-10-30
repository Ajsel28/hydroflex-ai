"""Mathematical-correctness and model-behaviour tests for the native LP."""

import numpy as np
import pytest
from conftest import toy_input, toy_scenario

from hydroflex.config import InvestmentOptions, SystemParams, TechnologyCosts, crf
from hydroflex.optimization.model import COST_KEY, INVESTABLE, RiskOptions, cvar_discrete, solve

TOL = 1e-5


def _ts(r, key="toy"):
    return r.timeseries[key]


def test_energy_balance_residual(battery_params):
    r = solve(toy_input(params=battery_params))
    assert r.optimal
    ts = _ts(r)
    supply = ts["pv"] + ts["wind"] + ts["ror"] + ts["hydro"] + ts["battery_discharge"] + ts["imports"] + ts["unserved"]
    use = ts["demand"] + ts["battery_charge"] + ts["exports"]
    assert np.max(np.abs(supply - use)) < TOL


def test_battery_energy_conservation(battery_params):
    # no hydro flexibility and a tight interconnector so that storage is economically needed
    p = battery_params.model_copy(update={"hydro_res_p_mw": 0.0, "ror_p_mw": 0.0, "import_capacity_mw": 750.0,
                                          "pv_existing_mw": 600.0})
    r = solve(toy_input(params=p))
    ts, m = _ts(r), r.scenario_results[0]
    soc0 = p.battery_soc0_frac * p.battery_energy_existing_mwh
    lhs = ts["soc_mwh"][-1] - soc0
    rhs = p.battery_eta_charge * ts["battery_charge"].sum() - ts["battery_discharge"].sum() / p.battery_eta_discharge
    assert abs(lhs - rhs) < TOL
    assert m["battery_throughput_mwh"] > 0
    assert np.all(ts["soc_mwh"] <= p.battery_energy_existing_mwh + TOL)
    assert np.all(ts["soc_mwh"] >= p.battery_soc_min_frac * p.battery_energy_existing_mwh - TOL)


def test_reservoir_water_conservation():
    p = SystemParams()
    r = solve(toy_input(params=p))
    ts, m = _ts(r), r.scenario_results[0]
    dv = ts["reservoir_hm3"][-1] - m["res_v_start_hm3"]
    net = (ts["inflow_hm3_h"] - ts["release_hm3_h"] - ts["spill_hm3_h"]).sum()
    assert abs(dv - net) < TOL
    assert np.all(ts["reservoir_hm3"] >= p.res_vmin_hm3 - TOL)
    assert np.all(ts["reservoir_hm3"] <= p.res_vmax_hm3 + TOL)
    assert ts["reservoir_hm3"][-1] >= m["res_v_start_hm3"] - TOL  # terminal condition


def test_hydro_energy_water_conversion_dimensional():
    p = SystemParams(hydro_head_m=100, hydro_efficiency=1.0)
    # 1 hm3 falling 100 m at 100% efficiency: 1e9 kg * 9.81 * 100 J = 9.81e11 J = 272.5 MWh
    assert abs(p.mwh_per_hm3 - 272.5) < 0.01
    assert abs(SystemParams().turbine_max_hm3_per_h * SystemParams().mwh_per_hm3 - 1350.0) < 1e-9


def test_capacity_limits_respected():
    r = solve(toy_input())
    ts = _ts(r)
    p = SystemParams()
    assert np.all(ts["pv"] <= ts["pv_available"] + TOL)
    assert np.all(ts["wind"] <= ts["wind_available"] + TOL)
    assert np.all(ts["hydro"] <= p.hydro_res_p_mw + TOL)
    assert np.all(ts["imports"] <= p.import_capacity_mw + TOL)
    assert np.all(ts["exports"] <= p.export_capacity_mw + TOL)
    assert np.all(ts["unserved"] >= -TOL)


def test_zero_solar_availability_gives_zero_solar():
    s = toy_scenario(pv_scale=0.0)
    r = solve(toy_input(scen=[s]))
    assert np.max(np.abs(_ts(r)["pv"])) < TOL


def test_zero_battery_capacity_prevents_storage():
    r = solve(toy_input(params=SystemParams(battery_power_existing_mw=0, battery_energy_existing_mwh=0)))
    ts = _ts(r)
    assert np.max(ts["battery_charge"]) < TOL and np.max(ts["battery_discharge"]) < TOL


def test_zero_import_capacity_prevents_imports():
    r = solve(toy_input(params=SystemParams(import_capacity_mw=0)))
    assert np.max(_ts(r)["imports"]) < TOL


def test_import_availability_derating():
    s = toy_scenario(import_avail=0.5, demand=1800, inflow=0.1)
    r = solve(toy_input(scen=[s]))
    assert np.max(_ts(r)["imports"]) <= 0.5 * SystemParams().import_capacity_mw + TOL


def test_drought_never_creates_impossible_hydro():
    for inflow in (0.8, 0.2, 0.0):
        p = SystemParams(min_release_m3s=0)
        r = solve(toy_input(scen=[toy_scenario(inflow=inflow)], params=p))
        ts, m = _ts(r), r.scenario_results[0]
        released = ts["release_hm3_h"].sum() + ts["spill_hm3_h"].sum()
        # terminal V_T >= V_0  =>  total release cannot exceed total inflow
        assert released <= ts["inflow_hm3_h"].sum() + TOL
        assert np.all(ts["hydro"] <= p.hydro_res_p_mw + TOL)


def test_shortage_remains_visible_under_insufficient_supply():
    p = SystemParams(import_capacity_mw=0, export_capacity_mw=0, pv_existing_mw=0, ror_p_mw=0, min_release_m3s=0)
    s = toy_scenario(inflow=0.05, demand=1200)
    r = solve(toy_input(scen=[s], params=p))
    m = r.scenario_results[0]
    assert r.optimal and m["ens_mwh"] > 1000 and m["lol_hours"] > 0
    assert m["max_balance_residual_mw"] < TOL


def test_voll_increase_does_not_increase_unserved_energy():
    base = dict(import_capacity_mw=300, pv_existing_mw=0)
    s = toy_scenario(inflow=0.15, demand=1300)
    ens = []
    for voll in (300, 1000, 5000, 20000):
        r = solve(toy_input(scen=[s], params=SystemParams(voll_eur_mwh=voll, **base)))
        ens.append(r.scenario_results[0]["ens_mwh"])
    assert all(ens[i + 1] <= ens[i] + 1e-3 for i in range(len(ens) - 1))


def test_zero_demand():
    s = toy_scenario(demand=0.0)
    r = solve(toy_input(scen=[s]))
    m = r.scenario_results[0]
    assert r.optimal and m["ens_mwh"] == 0 and m["imports_mwh"] < TOL
    assert r.objective_keur <= TOL  # only exports (revenue) and vom


def test_infeasible_configuration_reported():
    # Environmental release of 500 m3/s with almost no inflow and terminal V_T >= V_0 is impossible
    p = SystemParams(min_release_m3s=500, res_v0_frac=0.0)
    r = solve(toy_input(scen=[toy_scenario(inflow=0.01)], params=p))
    assert not r.optimal
    assert "nfeasible" in r.status
    assert r.warnings


def test_objective_reconciliation_dispatch(battery_params):
    r = solve(toy_input(params=battery_params))
    m = r.scenario_results[0]
    assert abs(r.objective_keur - m["opex_keur"]) < 1e-6 * max(1, abs(r.objective_keur))


def test_investment_budget_and_objective_reconciliation():
    inv = InvestmentOptions(enabled=True, budget_meur=150)
    s = toy_scenario(T=72, inflow=0.3, demand=1100)
    r = solve(toy_input(scen=[s], invest=inv))
    assert r.optimal
    assert r.expected["capex_overnight_meur"] <= 150 + 1e-6
    over = TechnologyCosts().overnight_keur_per_unit()
    spent = sum(over[COST_KEY[k]] * r.additions[k] for k in INVESTABLE) / 1000
    assert abs(spent - r.expected["capex_overnight_meur"]) < 1e-9
    m = r.scenario_results[0]
    assert abs(r.objective_keur - (m["capex_keur"] + m["opex_keur"])) < 1e-6 * max(1, abs(r.objective_keur))
    assert all(v >= -1e-7 for v in r.additions.values())


def test_battery_duration_limit():
    inv = InvestmentOptions(enabled=True, battery_max_duration_h=2.0)
    s = toy_scenario(T=72, inflow=0.2, demand=1300, price=400)
    r = solve(toy_input(scen=[s], invest=inv))
    assert r.capacities["be"] <= 2.0 * r.capacities["bp"] + 1e-6


def test_crf():
    assert abs(crf(0.07, 25) - 0.085811) < 1e-5
    assert abs(crf(0.0, 20) - 0.05) < 1e-12


def test_reproducibility():
    a = solve(toy_input()).objective_keur
    b = solve(toy_input()).objective_keur
    assert a == b


# ---------------- stochastic & risk ---------------------------------------------------------
def _three():
    return [toy_scenario(key="wet", prob=0.3, inflow=1.0, seed=1), toy_scenario(key="mid", prob=0.5, inflow=0.5, seed=2),
            toy_scenario(key="dry", prob=0.2, inflow=0.1, demand=1250, price=180, seed=3)]


def test_cvar_discrete():
    out = cvar_discrete(np.array([1.0, 2.0, 10.0]), np.array([0.5, 0.3, 0.2]), 0.9)
    assert out["var_keur"] == 10.0 and abs(out["cvar_keur"] - 10.0) < 1e-12
    out = cvar_discrete(np.array([1.0, 2.0, 10.0]), np.array([0.5, 0.3, 0.2]), 0.7)
    # tail of mass 0.3 beyond alpha: 0.1 at 2 and 0.2 at 10 -> CVaR = (0.1*2 + 0.2*10)/0.3
    assert abs(out["cvar_keur"] - (0.1 * 2 + 0.2 * 10) / 0.3) < 1e-9


def test_stochastic_objective_and_cvar_reconciliation():
    inv = InvestmentOptions(enabled=True, budget_meur=300)
    lam, alpha = 0.5, 0.8
    r = solve(toy_input(scen=_three(), invest=inv, risk=RiskOptions(alpha=alpha, weight=lam)))
    assert r.optimal
    capex = r.scenario_results[0]["capex_keur"]
    exp_opex = sum(m["probability"] * m["opex_keur"] for m in r.scenario_results)
    obj = capex + exp_opex + lam * r.risk["cvar_keur"]
    assert abs(obj - r.objective_keur) < 1e-5 * max(1, abs(obj))


def test_value_of_stochastic_solution_nonnegative():
    inv = InvestmentOptions(enabled=True, budget_meur=300)
    sc = _three()
    stoch = solve(toy_input(scen=sc, invest=inv))
    # deterministic plan optimised for the expected-value (mid) scenario, evaluated across all scenarios
    det = solve(toy_input(scen=[toy_scenario(key="mid", prob=1.0, inflow=0.5, seed=2)], invest=inv))
    fixed = det.capacities
    ev = solve(toy_input(scen=sc, invest=inv, fixed=fixed))
    assert ev.optimal
    assert stoch.objective_keur <= ev.objective_keur + 1e-6


def test_risk_aversion_does_not_increase_cvar():
    inv = InvestmentOptions(enabled=True, budget_meur=300)
    c0 = solve(toy_input(scen=_three(), invest=inv, risk=RiskOptions(alpha=0.8, weight=0.0))).risk["cvar_keur"]
    c1 = solve(toy_input(scen=_three(), invest=inv, risk=RiskOptions(alpha=0.8, weight=5.0))).risk["cvar_keur"]
    assert c1 <= c0 + 1e-6


# ---------------- marginal values (dual vs finite difference) -------------------------------
@pytest.mark.parametrize("key,delta", [("be", 20.0), ("bp", 10.0), ("pv", 10.0), ("imp", 10.0)])
def test_dual_marginal_value_is_subgradient(battery_params, key, delta):
    s = toy_scenario(T=48, inflow=0.3, demand=1200)
    base_fixed = {"pv": 300.0, "wind": 0.0, "bp": 200.0, "be": 800.0, "imp": 900.0, "vmax": 2400.0}
    r0 = solve(toy_input(scen=[s], params=battery_params, fixed=base_fixed))
    val = r0.duals[f"marginal_value_{key}"]["per_unit_horizon_keur"]  # = -d opex / dx
    up = solve(toy_input(scen=[s], params=battery_params, fixed={**base_fixed, key: base_fixed[key] + delta}))
    dn = solve(toy_input(scen=[s], params=battery_params, fixed={**base_fixed, key: base_fixed[key] - delta}))
    o0 = r0.scenario_results[0]["opex_keur"]
    right = -(up.scenario_results[0]["opex_keur"] - o0) / delta  # value of adding
    left = -(o0 - dn.scenario_results[0]["opex_keur"]) / delta   # value of the last unit
    # convex value function: right-derivative value <= dual value <= left-derivative value
    assert right - 1e-6 <= val <= left + 1e-6
