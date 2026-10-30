"""Deterministic, rule-based explanation of an optimisation result.

Every statement is computed from solver output (primal values, duals, binding constraints).
No language model is used; templates are filled only with numbers present in the result.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from hydroflex.optimization.model import ModelInput, ModelResult


def explain(res: ModelResult, mi: ModelInput) -> list[dict[str, Any]]:
    if not res.optimal:
        return [{"kind": "error", "title": "No optimal solution",
                 "detail": f"Solver status: {res.status}. " + " ".join(res.warnings), "evidence": {}}]
    out: list[dict[str, Any]] = []
    p = mi.params
    for m in res.scenario_results:
        ts = res.timeseries.get(m["key"], {})
        tag = m["label"]
        if m["ens_mwh"] > 1e-3:
            out.append({"kind": "reliability", "scenario": m["key"], "severity": "critical",
                        "title": f"{tag}: supply shortfall",
                        "detail": f"{m['ens_mwh']:.0f} MWh of demand is unserved over {m['lol_hours']:.0f} h "
                                  f"(peak shortfall {m['peak_shortfall_mw']:.0f} MW). At VOLL = {p.voll_eur_mwh:.0f} "
                                  "EUR/MWh the optimiser found no cheaper feasible supply in those hours.",
                        "evidence": {"ens_mwh": m["ens_mwh"], "lol_hours": m["lol_hours"]}})
        else:
            out.append({"kind": "reliability", "scenario": m["key"], "severity": "ok",
                        "title": f"{tag}: demand fully served",
                        "detail": "No unserved energy in any modelled hour.", "evidence": {"ens_mwh": 0.0}})
        if m["import_cap_binding_hours"] > 0:
            out.append({"kind": "binding", "scenario": m["key"], "severity": "warning",
                        "title": f"{tag}: interconnector limit binding",
                        "detail": f"Imports are at the available transfer limit for {m['import_cap_binding_hours']:.0f} h "
                                  f"({100 * m['import_cap_binding_hours'] / (len(mi.scenarios[0].demand) * mi.dt):.1f}% of the horizon). "
                                  "In those hours the marginal price is set by domestic scarcity, not by the import price.",
                        "evidence": {"hours": m["import_cap_binding_hours"]}})
        if m["res_hours_at_min"] > 0:
            out.append({"kind": "binding", "scenario": m["key"], "severity": "warning",
                        "title": f"{tag}: reservoir at minimum operating level",
                        "detail": f"The aggregated Drin reservoir reaches its minimum volume ({p.res_vmin_hm3:.0f} hm³) "
                                  f"for {m['res_hours_at_min']:.0f} h; hydro output is then limited to inflow.",
                        "evidence": {"hours": m["res_hours_at_min"], "v_min_reached_hm3": m["res_v_min_hm3"]}})
        if m["res_spill_hm3"] > 1e-3:
            out.append({"kind": "operation", "scenario": m["key"], "severity": "info",
                        "title": f"{tag}: reservoir spill",
                        "detail": f"{m['res_spill_hm3']:.1f} hm³ is spilled — storage or turbine capacity is "
                                  "insufficient to use all inflow.", "evidence": {"spill_hm3": m["res_spill_hm3"]}})
        if m["curtailment_share"] > 0.01:
            out.append({"kind": "operation", "scenario": m["key"], "severity": "info",
                        "title": f"{tag}: variable renewable curtailment",
                        "detail": f"{100 * m['curtailment_share']:.1f}% of available solar+wind energy is curtailed "
                                  f"({m['pv_curtail_mwh'] + m['wind_curtail_mwh']:.0f} MWh): export, storage and "
                                  "demand cannot absorb it in those hours.",
                        "evidence": {"curtailment_share": m["curtailment_share"]}})
        if m["battery_throughput_mwh"] > 0:
            out.append({"kind": "storage", "scenario": m["key"], "severity": "info",
                        "title": f"{tag}: battery cycling",
                        "detail": f"The battery discharges {m['battery_throughput_mwh']:.0f} MWh "
                                  f"({m['battery_cycles']:.1f} equivalent full cycles), shifting energy from low- to "
                                  "high-price hours.", "evidence": {"cycles": m["battery_cycles"]}})
        price = ts.get("price_eur_mwh")
        if price is not None and np.all(np.isfinite(price)):
            out.append({"kind": "price", "scenario": m["key"], "severity": "info",
                        "title": f"{tag}: system marginal cost",
                        "detail": f"Shadow price of the energy balance: mean {np.mean(price):.1f}, max {np.max(price):.1f} "
                                  "EUR/MWh. Values above the import price indicate binding supply constraints; values "
                                  f"near VOLL ({p.voll_eur_mwh:.0f}) indicate shortage hours.",
                        "evidence": {"mean": float(np.mean(price)), "max": float(np.max(price))}})
    if mi.invest.enabled:
        adds = {k: v for k, v in res.additions.items() if v > 0.5}
        detail = ", ".join(f"{k}: +{v:.0f}" for k, v in adds.items()) or "no additions"
        b = res.duals.get("budget_shadow_price")
        extra = ""
        if b and b["binding"]:
            extra = (f" The capital budget is binding: one extra kEUR of overnight capital would reduce the horizon "
                     f"objective by {b['keur_per_keur_overnight_horizon']:.4f} kEUR.")
        out.append({"kind": "investment", "severity": "info", "title": "Optimal capacity additions",
                    "detail": f"Additions (MW / MWh): {detail}.{extra}", "evidence": res.additions})
    for k, label, unit in (("be", "battery energy", "MWh"), ("bp", "battery power", "MW"), ("pv", "solar PV", "MW"),
                           ("wind", "wind", "MW"), ("imp", "import capacity", "MW"), ("vmax", "reservoir volume", "hm³")):
        d = res.duals.get(f"marginal_value_{k}")
        if d is not None and d.get("reliable", True):
            out.append({"kind": "marginal", "severity": "info", "title": f"Marginal value of {label}",
                        "detail": f"{d['per_unit_annualised_keur']:.2f} kEUR per {unit} per year (dual-based, "
                                  "local; valid only for small changes around this solution).",
                        "evidence": d})
    return out
