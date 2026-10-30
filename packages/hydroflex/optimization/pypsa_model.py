"""PyPSA (+ linopy + HiGHS) implementation of the deterministic single-scenario model.

This is an independent formulation of the same physics using PyPSA components, used to cross-validate
the native sparse-matrix model (objective values, dispatch totals, reservoir trajectories).

Mapping:
  * Bus "AL" (copper plate), Load = demand
  * Generators: solar, wind (p_max_pu = capacity factor, optional extendable), run-of-river
    (p_max_pu = availability / P), imports (time-varying marginal cost, p_max_pu = availability),
    exports (p_min_pu = -1, p_max_pu = 0, marginal cost = export price -> revenue), load shedding (VOLL)
  * StorageUnit "drin": energy-equivalent reservoir; SOC = (V - Vmin)*kappa, inflow = I*kappa (MW),
    max_hours = live energy / P, no pumping, spill allowed; state_of_charge_set at the last
    snapshot enforces V_T = V_0 (native res_terminal="eq")
  * Battery: Store + charger Link (eta_c) + discharger Link (eta_d); native SOC dynamics with
    cyclic SOC (native battery_terminal="cyclic"). The discharger p_nom is P/eta_d so that
    delivered power <= P as in the native model.
Restrictions for the cross-check: min_release = 0, battery power/energy fixed, no budget constraint
(PyPSA has no native overnight-capital budget for mixed components).
"""

from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
import pandas as pd

from hydroflex.optimization.model import ModelInput

logging.getLogger("pypsa").setLevel(logging.ERROR)
logging.getLogger("linopy").setLevel(logging.ERROR)


def build_network(mi: ModelInput, pv_extendable: bool = False, wind_extendable: bool = False):
    import pypsa

    if len(mi.scenarios) != 1:
        raise ValueError("PyPSA cross-check supports a single scenario")
    p, c, s = mi.params, mi.costs, mi.scenarios[0]
    if p.min_release_m3s > 0:
        raise ValueError("cross-check requires min_release_m3s = 0")
    T, dt = mi.T, mi.dt
    w = mi.horizon_weight
    ann = c.annualised_keur_per_unit()
    kappa = p.mwh_per_hm3
    cap = dict(mi.fixed_capacity or {})
    pv_cap = cap.get("pv", p.pv_existing_mw)
    wind_cap = cap.get("wind", p.wind_existing_mw)
    bp = cap.get("bp", p.battery_power_existing_mw)
    be = cap.get("be", p.battery_energy_existing_mwh)
    imp = cap.get("imp", p.import_capacity_mw)

    n = pypsa.Network()
    snaps = pd.RangeIndex(T, name="snapshot")
    n.set_snapshots(snaps)
    n.snapshot_weightings.loc[:, :] = dt
    n.add("Carrier", ["solar", "wind", "hydro", "ror", "import", "export", "shed", "battery", "AC"])
    n.add("Bus", "AL", carrier="AC")
    n.add("Bus", "battery_bus", carrier="battery")
    n.add("Load", "demand", bus="AL", p_set=pd.Series(s.demand, index=snaps))
    # costs are in kEUR per MWh (marginal) and kEUR per MW per horizon (capital)
    n.add("Generator", "solar", bus="AL", carrier="solar", p_nom=pv_cap, p_nom_min=pv_cap,
          p_nom_max=pv_cap + (mi.invest.pv_max_mw if pv_extendable else 0), p_nom_extendable=pv_extendable,
          capital_cost=w * ann["pv"], p_max_pu=pd.Series(s.pv_cf, index=snaps), marginal_cost=0.0)
    n.add("Generator", "wind", bus="AL", carrier="wind", p_nom=wind_cap, p_nom_min=wind_cap,
          p_nom_max=wind_cap + (mi.invest.wind_max_mw if wind_extendable else 0), p_nom_extendable=wind_extendable,
          capital_cost=w * ann["wind"], p_max_pu=pd.Series(s.wind_cf, index=snaps), marginal_cost=0.0)
    ror_pu = s.ror_avail / p.ror_p_mw if p.ror_p_mw > 0 else np.zeros(T)
    n.add("Generator", "ror", bus="AL", carrier="ror", p_nom=p.ror_p_mw, p_max_pu=pd.Series(ror_pu, index=snaps))
    n.add("Generator", "imports", bus="AL", carrier="import", p_nom=imp,
          p_max_pu=s.import_availability, marginal_cost=pd.Series(s.import_price / 1000.0, index=snaps))
    n.add("Generator", "exports", bus="AL", carrier="export", p_nom=p.export_capacity_mw, p_min_pu=-1.0, p_max_pu=0.0,
          marginal_cost=pd.Series(s.import_price * s.export_price_ratio / 1000.0, index=snaps))
    n.add("Generator", "shedding", bus="AL", carrier="shed", p_nom=float(np.max(s.demand)) + 1.0,
          p_max_pu=pd.Series(s.demand / (float(np.max(s.demand)) + 1.0), index=snaps),
          marginal_cost=p.voll_eur_mwh / 1000.0)
    live_mwh = (p.res_vmax_hm3 - p.res_vmin_hm3) * kappa
    v0 = s.v0_hm3 if s.v0_hm3 is not None else (mi.v0_hm3 if mi.v0_hm3 is not None else
                                               p.res_vmin_hm3 + p.res_v0_frac * (p.res_vmax_hm3 - p.res_vmin_hm3))
    vt = s.v_terminal_hm3 if s.v_terminal_hm3 is not None else v0
    soc_set = pd.Series(np.nan, index=snaps)
    soc_set.iloc[-1] = (vt - p.res_vmin_hm3) * kappa
    n.add("StorageUnit", "drin", bus="AL", carrier="hydro", p_nom=p.hydro_res_p_mw,
          max_hours=live_mwh / p.hydro_res_p_mw, efficiency_store=0.0, efficiency_dispatch=1.0,
          p_min_pu=0.0, inflow=pd.Series(s.inflow * kappa, index=snaps), state_of_charge_initial=(v0 - p.res_vmin_hm3) * kappa,
          state_of_charge_set=soc_set, cyclic_state_of_charge=False, marginal_cost=p.hydro_vom_eur_mwh / 1000.0,
          spill_cost=0.0)
    if bp > 0 and be > 0:
        n.add("Store", "battery", bus="battery_bus", carrier="battery", e_nom=be, e_min_pu=p.battery_soc_min_frac,
              e_cyclic=True)
        n.add("Link", "battery_charger", bus0="AL", bus1="battery_bus", p_nom=bp, efficiency=p.battery_eta_charge)
        n.add("Link", "battery_discharger", bus0="battery_bus", bus1="AL", p_nom=bp / p.battery_eta_discharge,
              efficiency=p.battery_eta_discharge,
              marginal_cost=p.battery_degradation_eur_mwh * p.battery_eta_discharge / 1000.0)
    return n


def solve_pypsa(mi: ModelInput, pv_extendable: bool = False, wind_extendable: bool = False) -> dict[str, Any]:
    t0 = time.perf_counter()
    n = build_network(mi, pv_extendable, wind_extendable)
    status, condition = n.optimize(solver_name="highs", solver_options={"output_flag": False})
    p = mi.params
    w = mi.horizon_weight
    ann = mi.costs.annualised_keur_per_unit()
    # PyPSA charges capital cost on the full p_nom of extendable assets; remove the existing-fleet constant
    offset = 0.0
    if pv_extendable:
        offset += w * ann["pv"] * float(n.generators.at["solar", "p_nom_min"])
    if wind_extendable:
        offset += w * ann["wind"] * float(n.generators.at["wind", "p_nom_min"])
    obj = float(n.objective) + float(getattr(n, "objective_constant", 0.0) or 0.0) - offset
    gen = n.generators_t.p
    dt = mi.dt
    su = n.storage_units_t
    out = {
        "status": status, "condition": condition, "objective_keur": obj, "seconds": time.perf_counter() - t0,
        "imports_mwh": float(gen["imports"].sum() * dt), "exports_mwh": float(-gen["exports"].sum() * dt),
        "ens_mwh": float(gen["shedding"].sum() * dt), "pv_mwh": float(gen["solar"].sum() * dt),
        "wind_mwh": float(gen["wind"].sum() * dt), "ror_mwh": float(gen["ror"].sum() * dt),
        "hydro_res_mwh": float(su.p_dispatch["drin"].sum() * dt),
        "reservoir_hm3": (su.state_of_charge["drin"].to_numpy() / p.mwh_per_hm3 + p.res_vmin_hm3),
        "spill_hm3": float(su.spill["drin"].sum() * dt / p.mwh_per_hm3) if "drin" in su.spill else 0.0,
        "marginal_price_eur_mwh": n.buses_t.marginal_price["AL"].to_numpy() * 1000.0 / dt,
        "pv_p_nom": float(n.generators.at["solar", "p_nom_opt"]),
        "wind_p_nom": float(n.generators.at["wind", "p_nom_opt"]),
    }
    if "battery_discharger" in n.links.index:
        out["battery_throughput_mwh"] = float(-n.links_t.p1["battery_discharger"].sum() * dt)
    else:
        out["battery_throughput_mwh"] = 0.0
    return out
