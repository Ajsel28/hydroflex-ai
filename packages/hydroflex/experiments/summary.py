"""Build ref-summary.json: per-experiment hypothesis, configuration, computed finding and limitation.

Finding sentences are templates filled only with numbers read from the experiment files. Whether a
hypothesis is supported is decided by explicit numerical tests written below, not by hand.
"""

from __future__ import annotations

import json
from typing import Any

from hydroflex.experiments.run_all import EXP, save

TWh = 1e6


def load(n: str) -> dict | None:
    f = EXP / f"{n}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def _m(d: dict) -> dict:
    return d["scenarios"][0]


def _by(d: dict) -> dict[str, dict]:
    return {r["tag"]: r["metrics"] for r in d["rows"] if r.get("optimal")}


def main() -> None:
    ex: list[dict[str, Any]] = []
    A, Bm, Bs, F = (load(x) for x in ("ref-A-normal-annual", "ref-B-moderate-annual", "ref-B-severe-annual",
                                       "ref-F-compound-annual"))
    if A:
        m = _m(A)
        ex.append({"id": "A", "title": "Reference operation, normal conditions",
                   "hypothesis": "With reference inflows the existing hydro-dominated fleet serves demand without shortage, "
                                 "using the interconnector for both imports and exports.",
                   "configuration": "8760 h hourly, existing fleet, reference weather year",
                   "finding": f"Demand {m['demand_mwh'] / TWh:.2f} TWh is fully served (ENS {m['ens_mwh']:.0f} MWh). Hydro supplies "
                              f"{(m['hydro_res_mwh'] + m['ror_mwh']) / TWh:.2f} TWh; gross imports {m['imports_mwh'] / TWh:.2f} TWh and "
                              f"exports {m['exports_mwh'] / TWh:.2f} TWh (net {m['net_imports_mwh'] / TWh:.2f} TWh). Annual operating "
                              f"cost {m['opex_keur_annualised'] / 1e3:.1f} MEUR.",
                   "supported": m["ens_mwh"] < 1, "metrics": {k: m[k] for k in ("ens_mwh", "imports_mwh", "exports_mwh",
                                                                                 "opex_keur_annualised")},
                   "limitations": "Synthetic demand and prices; exports are priced at 85% of the synthetic import price."})
    if A and Bm and Bs:
        a, b, c = _m(A), _m(Bm), _m(Bs)
        ex.append({"id": "B", "title": "Hydropower reduction under drought",
                   "hypothesis": "Drought is absorbed mainly through higher net imports and cost; shortages do not occur while "
                                 "the interconnector is fully available.",
                   "configuration": "8760 h hourly; inflows −22% and −40%",
                   "finding": f"Net imports rise from {a['net_imports_mwh'] / TWh:.2f} TWh (normal) to {b['net_imports_mwh'] / TWh:.2f} "
                              f"(moderate) and {c['net_imports_mwh'] / TWh:.2f} TWh (severe); operating cost rises from "
                              f"{a['opex_keur_annualised'] / 1e3:.1f} to {b['opex_keur_annualised'] / 1e3:.1f} and "
                              f"{c['opex_keur_annualised'] / 1e3:.1f} MEUR/yr. ENS: {b['ens_mwh']:.0f} and {c['ens_mwh']:.0f} MWh.",
                   "supported": b["ens_mwh"] < 1 and c["ens_mwh"] < 1 and c["net_imports_mwh"] > a["net_imports_mwh"],
                   "metrics": {"net_imports_twh": [a["net_imports_mwh"] / TWh, b["net_imports_mwh"] / TWh, c["net_imports_mwh"] / TWh],
                               "opex_meur": [a["opex_keur_annualised"] / 1e3, b["opex_keur_annualised"] / 1e3,
                                             c["opex_keur_annualised"] / 1e3]},
                   "limitations": "Drought modelled as a uniform inflow scaling of one reconstructed year."})
    C = load("exp-C")
    if C:
        g = _by(C)
        out = {}
        for sc in ("normal", "severe_drought"):
            base = g[f"{sc}|pv0"]
            out[sc] = [(pv, (base["imports_mwh"] - g[f"{sc}|pv{pv}"]["imports_mwh"]) / pv,
                        g[f"{sc}|pv{pv}"]["pv_curtail_mwh"]) for pv in (500, 1000, 1500)]
        dim = all(out[sc][2][1] < out[sc][0][1] for sc in out)
        ex.append({"id": "C", "title": "Solar without batteries",
                   "hypothesis": "Import reduction per added MW of PV declines with PV size (diminishing returns).",
                   "configuration": "PV +500/+1000/+1500 MW, annual hourly, normal and severe",
                   "finding": "Gross import reduction per added MW: normal " + ", ".join(f"+{p} MW: {v:.0f} MWh/MW" for p, v, _ in out["normal"])
                              + "; severe " + ", ".join(f"+{p} MW: {v:.0f} MWh/MW" for p, v, _ in out["severe_drought"])
                              + f". PV curtailment at +1500 MW: normal {out['normal'][2][2] / 1e3:.0f} GWh, severe "
                                f"{out['severe_drought'][2][2] / 1e3:.0f} GWh.",
                   "supported": dim, "metrics": out,
                   "limitations": "Export capacity and the export price ratio determine how much midday PV surplus is "
                                  "absorbed; both are assumptions."})
    D = load("exp-D")
    if D:
        g = _by(D)
        s = {sc: {be: g[f"{sc}|b0/0"]["opex_keur_annualised"] - g[f"{sc}|b{bp}/{be}"]["opex_keur_annualised"]
                  for bp, be in ((200, 800), (400, 1600), (800, 3200))} for sc in ("normal", "severe_drought")}
        ex.append({"id": "D", "title": "Batteries without new renewables",
                   "hypothesis": "Battery operating value is modest relative to its annualised cost when reservoir hydro "
                                 "already provides flexibility.",
                   "configuration": "200/800, 400/1600, 800/3200 MW/MWh, annual hourly",
                   "finding": "Annual operating saving (MEUR/yr) normal: " + ", ".join(f"{k} MWh: {v / 1e3:.1f}" for k, v in s["normal"].items())
                              + "; severe: " + ", ".join(f"{k} MWh: {v / 1e3:.1f}" for k, v in s["severe_drought"].items()) + ".",
                   "supported": None, "metrics": s,
                   "limitations": "No ancillary-service, reserve or capacity revenues are modelled; these are often the main "
                                  "value streams of batteries."})
    E = load("exp-E")
    if E and E.get("synergy"):
        sy = E["synergy"]
        ex.append({"id": "E", "title": "Coordinated solar, wind, hydro and storage",
                   "hypothesis": "PV and storage are complements (positive synergy in operating savings).",
                   "configuration": "fixed portfolios, annual hourly",
                   "finding": "; ".join(f"{sc}: PV-only saving {v['opex_saving_pv_keur'] / 1e3:.1f}, battery-only "
                                        f"{v['opex_saving_batt_keur'] / 1e3:.1f}, combined {v['opex_saving_combined_keur'] / 1e3:.1f} MEUR/yr "
                                        f"(synergy {v['synergy_keur'] / 1e3:+.2f})" for sc, v in sy.items()),
                   "supported": all(v["synergy_keur"] > 0 for v in sy.values()), "metrics": sy,
                   "limitations": "Synergy depends on the export price ratio and NTC, both assumed."})
    Fx = load("exp-F")
    if Fx:
        g = _by(Fx)
        thr = [a for a in (1.0, 0.75, 0.5, 0.35, 0.25) if f"avail{a}" in g and g[f"avail{a}"]["ens_mwh"] > 1]
        ex.append({"id": "F", "title": "Import price shock and interconnector derating",
                   "hypothesis": "Price shocks raise cost but not shortage; shortages need a loss of import availability.",
                   "configuration": "severe drought; price ×1–3; NTC availability 100–25% with +8% demand",
                   "finding": f"Annual cost rises from {g['price1.0']['total_cost_keur_annualised'] / 1e3:.0f} to "
                              f"{g['price3.0']['total_cost_keur_annualised'] / 1e3:.0f} MEUR/yr as import prices triple, with ENS "
                              f"{g['price3.0']['ens_mwh']:.0f} MWh. Unserved energy appears at NTC availability ≤ "
                              f"{max(thr):.0%} ({g[f'avail{max(thr)}']['ens_mwh'] / 1e3:.1f} GWh)." if thr else
                              "No unserved energy in any tested configuration.",
                   "supported": g["price3.0"]["ens_mwh"] < 1 and bool(thr), "metrics": {"first_ens_availability": max(thr) if thr else None},
                   "limitations": "Import availability is an exogenous scenario parameter, not a regional market model."})
    G = load("exp-G")
    if G:
        g = _by(G)
        e = {a: [g[f"g{x}|a{a}"]["ens_mwh"] for x in (0.0, 0.1, 0.2, 0.3)] for a in (1.0, 0.5)}
        ex.append({"id": "G", "title": "Demand growth stress test",
                   "hypothesis": "Shortage grows non-linearly with demand when import availability is halved.",
                   "configuration": "severe drought; demand +0–30%; NTC availability 100% and 50%",
                   "finding": "ENS (MWh) at +0/10/20/30% demand: NTC 100%: " + ", ".join(f"{v:.0f}" for v in e[1.0])
                              + "; NTC 50%: " + ", ".join(f"{v:.0f}" for v in e[0.5]) + ".",
                   "supported": e[0.5][-1] > 0 and (e[0.5][-1] - e[0.5][-2]) >= (e[0.5][1] - e[0.5][0]), "metrics": e,
                   "limitations": "No demand response or emergency imports are modelled."})
    H = load("exp-H-budget-sweep")
    if H:
        rows = [r for r in H["rows"] if r["status"] == "Optimal"]
        ex.append({"id": "H", "title": "Investment planning under capital constraints",
                   "hypothesis": "Under a binding budget the optimiser invests first in the technology with the highest "
                                 "operating value per euro of capital.",
                   "configuration": "deterministic, normal scenario, 8 representative weeks, budgets 0–2000 MEUR",
                   "finding": "Optimal additions by budget: " + "; ".join(
                       f"{r['budget_meur']:.0f} MEUR → PV {r['additions']['pv']:.0f}, wind {r['additions']['wind']:.0f} MW, "
                       f"battery {r['additions']['bp']:.0f} MW/{r['additions']['be']:.0f} MWh" for r in rows) + ".",
                   "supported": None, "metrics": {str(r["budget_meur"]): r["additions"] for r in rows},
                   "limitations": "Results depend on the cost assumptions and on representative-week sampling."})
    I_ = load("ref-I-stochastic")
    if I_ and I_.get("deterministic_comparison"):
        c = I_["deterministic_comparison"]
        ex.append({"id": "I", "title": "Deterministic versus stochastic planning",
                   "hypothesis": "A stochastic, risk-aware plan reduces expected cost and tail risk relative to planning "
                                 "for normal conditions.",
                   "configuration": "5 scenarios, 8 weeks, budget 500 MEUR, CVaR α=0.9, λ=1",
                   "finding": f"VSS = {c['vss_keur_annualised'] / 1e3:.2f} MEUR/yr; EVPI = {c['evpi_keur_annualised'] / 1e3:.2f} MEUR/yr; "
                              f"CVaR(0.9) of operating cost: stochastic {c['rp_cvar_keur_annualised'] / 1e3:.1f} vs deterministic "
                              f"{(c['eev_cvar_keur_annualised'] or 0) / 1e3:.1f} MEUR/yr. Stochastic additions: "
                              + ", ".join(f"{k} {v:.0f}" for k, v in I_["additions"].items())
                              + "; deterministic additions: " + ", ".join(f"{k} {v:.0f}" for k, v in c["deterministic_plan_additions"].items()) + ".",
                   "supported": c["vss_keur_annualised"] > 1.0, "metrics": {k: c[k] for k in ("vss_keur_annualised", "evpi_keur_annualised",
                                                                                               "rp_cvar_keur_annualised", "eev_cvar_keur_annualised")},
                   "limitations": "Scenario probabilities are partly assumed; five scenarios cannot represent the full "
                                  "distribution of climate outcomes."})
    J = load("ref-J-marginal")
    if J:
        rows = [r for r in J["rows"] if r["scenario"] == "severe_drought"]
        ex.append({"id": "J", "title": "Marginal value of flexibility",
                   "hypothesis": "Dual values coincide with finite-difference marginal values where the LP is non-degenerate.",
                   "configuration": "fixed base fleet, annual hourly, ± increments",
                   "finding": "Severe drought, kEUR per unit-year (Δ+ / dual / Δ−): " + "; ".join(
                       f"{r['resource']}: {r['fd_right_keur_per_unit_yr']:.1f} / {r['dual_keur_per_unit_yr']:.1f} / "
                       + (f"{r['fd_left_keur_per_unit_yr']:.1f}" if r["fd_left_keur_per_unit_yr"] is not None else "n/a")
                       for r in rows) + ".",
                   "supported": all((r["fd_left_keur_per_unit_yr"] is None) or
                                    (r["fd_right_keur_per_unit_yr"] - 1e-3 <= r["dual_keur_per_unit_yr"] <= r["fd_left_keur_per_unit_yr"] + 1e-3)
                                    for r in J["rows"] if r["dual_reliable"]),
                   "metrics": {}, "limitations": "Local values around one fleet; not valid for large capacity changes."})
    save("ref-summary", {"kind": "summary", "experiments": ex})
    print("  summary: ref-summary.json with", len(ex), "experiments")


if __name__ == "__main__":
    main()
