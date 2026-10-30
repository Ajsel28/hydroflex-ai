"""Manuscript-ready LaTeX (booktabs) and CSV tables generated from results/experiments/*.json.

    python -m hydroflex.experiments.tables
Never edit the generated files by hand; rerun this module instead.
"""

from __future__ import annotations

import csv
import json
from typing import Any

from hydroflex import REPO_ROOT, RESULTS_DIR
from hydroflex.climate.scenarios import PRESETS, stochastic_scenario_set
from hydroflex.config import SystemParams, TechnologyCosts

EXP = RESULTS_DIR / "experiments"
TAB = REPO_ROOT / "research" / "paper" / "tables"


def load(name: str) -> dict | None:
    f = EXP / f"{name}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def esc(s: Any) -> str:
    return str(s).replace("&", r"\&").replace("%", r"\%").replace("_", r"\_").replace("#", r"\#")


def f0(x: float | None) -> str:
    return "--" if x is None else f"{x:,.0f}".replace(",", r"\,")


def f1(x: float | None) -> str:
    return "--" if x is None else f"{x:,.1f}".replace(",", r"\,")


def f2(x: float | None) -> str:
    return "--" if x is None else f"{x:,.2f}".replace(",", r"\,")


def f3(x: float | None) -> str:
    return "--" if x is None else f"{x:.3f}"


def write(name: str, header: list[str], rows: list[list[str]], caption: str, label: str, colspec: str | None = None,
          size: str = r"\small", raw_rows: list[list[Any]] | None = None) -> None:
    TAB.mkdir(parents=True, exist_ok=True)
    colspec = colspec or ("l" + "r" * (len(header) - 1))
    lines = [r"\begin{table}[htbp]", r"\centering", size, rf"\caption{{{caption}}}", rf"\label{{{label}}}",
             rf"\begin{{tabular}}{{{colspec}}}", r"\toprule", " & ".join(header) + r" \\", r"\midrule"]
    lines += [" & ".join(r) + r" \\" for r in rows]
    lines += [r"\bottomrule", r"\end{tabular}", r"\end{table}"]
    (TAB / f"{name}.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
    with open(TAB / f"{name}.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([h.replace("\\", "").replace("$", "") for h in header])
        for r in raw_rows or rows:
            w.writerow(r)
    print("  table", name)


def t_assumptions() -> None:
    p, c = SystemParams(), TechnologyCosts()
    ann = c.annualised_keur_per_unit()
    over = c.overnight_keur_per_unit()
    rows = [
        ["Drin cascade turbine capacity", "MW", f0(p.hydro_res_p_mw), "KESH (Fierza 500, Koman 600, Vau i Dejës 250)"],
        ["Aggregate head / efficiency", "m / --", f"{p.hydro_head_m:.0f} / {p.hydro_efficiency:.2f}", "assumption"],
        ["Energy equivalent $\\kappa$", "MWh/hm$^3$", f1(p.mwh_per_hm3), "derived"],
        ["Reservoir $V^{\\min}$ / $V^{\\max}$", "hm$^3$", f"{p.res_vmin_hm3:.0f} / {p.res_vmax_hm3:.0f}", "assumption"],
        ["Initial volume (live fraction)", "--", f2(p.res_v0_frac), "assumption"],
        ["Minimum release", "m$^3$/s", f0(p.min_release_m3s), "assumption"],
        ["Other hydro (run-of-river aggregate)", "MW", f0(p.ror_p_mw), "IRENA RRA (2,096 MW, 2018) + Moglicë 184 MW $-$ Drin"],
        ["Existing PV / wind", "MW", f"{p.pv_existing_mw:.0f} / {p.wind_existing_mw:.0f}", "assumption (order of magnitude)"],
        ["Import / export NTC", "MW", f"{p.import_capacity_mw:.0f} / {p.export_capacity_mw:.0f}", "assumption"],
        ["Export price ratio $\\rho$", "--", f2(p.export_price_ratio), "assumption"],
        ["VOLL", "EUR/MWh", f0(p.voll_eur_mwh), "assumption (varied 2,000--10,000)"],
        ["Battery $\\eta^c$, $\\eta^d$ / min SOC", "--", f"{p.battery_eta_charge:.2f}, {p.battery_eta_discharge:.2f} / {p.battery_soc_min_frac:.2f}", "assumption"],
        ["Battery degradation proxy", "EUR/MWh", f1(p.battery_degradation_eur_mwh), "assumption"],
        ["PV capex (incl. ×1.25 regional)", "EUR/kW", f0(over["pv"]), "IRENA RPGC 2024: USD 691/kW"],
        ["Onshore wind capex (incl. ×1.25)", "EUR/kW", f0(over["wind"]), "IRENA RPGC 2024: USD 1,041/kW"],
        ["Battery energy capex (incl. ×1.25)", "EUR/kWh", f0(over["battery_energy"]), "IRENA RPGC 2024: USD 192/kWh"],
        ["Battery power capex (incl. ×1.25)", "EUR/kW", f0(over["battery_power"]), "assumption"],
        ["Discount rate / lifetimes", "-- / yr", f"{c.discount_rate:.2f} / {c.pv_lifetime:.0f}, {c.wind_lifetime:.0f}, {c.battery_lifetime:.0f}", "assumption"],
        ["Annualised PV / wind", "kEUR/MW-yr", f"{ann['pv']:.1f} / {ann['wind']:.1f}", "derived (CRF + FOM)"],
        ["Annualised battery power / energy", "kEUR/(MW, MWh)-yr", f"{ann['battery_power']:.1f} / {ann['battery_energy']:.1f}", "derived"],
    ]
    write("tab_assumptions", ["Parameter", "Unit", "Value", "Source / status"], rows,
          "Key system and cost parameters. ``Assumption'' marks values chosen for this study that were not taken from "
          "an observed Albanian dataset.", "tab:assumptions", colspec="p{5.2cm}lrp{5.0cm}", size=r"\footnotesize")


def t_scenarios() -> None:
    rows = []
    for s in PRESETS.values():
        rows.append([esc(s.label), f2(1 - s.drought_severity), f2(1 + s.demand_growth), f2(s.import_price_multiplier),
                     f2(s.import_availability), "--"])
    for s in stochastic_scenario_set():
        rows.append([esc(s.label) + " (stoch.)", f3(1 - s.drought_severity), f2(1 + s.demand_growth),
                     f2(s.import_price_multiplier), f2(s.import_availability), f3(s.probability)])
    write("tab_scenarios", ["Scenario", "Inflow factor", "Demand factor", "Import price", "NTC avail.", "Prob."], rows,
          "Climate and market scenarios. Upper block: named stress presets; lower block: five-scenario set for two-stage "
          "planning (historical-bin probabilities from the reconstructed 2001--2023 inflow index, plus an assumed 15\\% "
          "climate-stress allowance).", "tab:scenarios")


def t_annual() -> None:
    runs = [("ref-A-normal-annual", "Normal"), ("ref-B-moderate-annual", "Moderate drought"),
            ("ref-B-severe-annual", "Severe drought"), ("ref-F-compound-annual", "Compound shock"),
            ("ref-E-coordinated-normal", "Coordinated fleet, normal"),
            ("ref-E-coordinated-severe", "Coordinated fleet, severe")]
    rows, raw = [], []
    for rid, lab in runs:
        d = load(rid)
        if not d:
            continue
        m = d["scenarios"][0]
        hyd = (m["hydro_res_mwh"] + m["ror_mwh"]) / 1e6
        rows.append([lab, f2(m["demand_mwh"] / 1e6), f2(hyd), f2((m["pv_mwh"] + m["wind_mwh"]) / 1e6), f2(m["imports_mwh"] / 1e6),
                     f2(m["exports_mwh"] / 1e6), f0(m["ens_mwh"]), f1(m["opex_keur_annualised"] / 1e3),
                     f1(m["price_mean_eur_mwh"])])
        raw.append([lab, m["demand_mwh"], hyd * 1e6, m["pv_mwh"] + m["wind_mwh"], m["imports_mwh"], m["exports_mwh"],
                    m["ens_mwh"], m["opex_keur_annualised"], m["price_mean_eur_mwh"]])
    write("tab_annual", ["Case", "Demand", "Hydro", "PV+wind", "Imports", "Exports", "ENS", "Opex", "Price"], rows,
          "Annual hourly dispatch (8760 h, reference weather year). Energies in TWh, ENS in MWh, operating cost "
          "(imports $-$ exports + penalties + variable O\\&M) in MEUR/yr, mean shadow price in EUR/MWh. Existing fleet "
          "unless stated.", "tab:annual", raw_rows=raw, size=r"\footnotesize")


def _rows(d: dict, tags: list[tuple[str, str]], cols: list[tuple[str, str, Any]]) -> tuple[list, list]:
    by = {r["tag"]: r for r in d["rows"]}
    rows, raw = [], []
    for tag, lab in tags:
        r = by.get(tag)
        if not r or not r.get("optimal"):
            rows.append([lab] + ["n/a"] * len(cols))
            continue
        m = r["metrics"]
        rows.append([lab] + [fmt(fn(m)) for _, fn, fmt in [(c[0], c[1], c[2]) for c in cols]])
        raw.append([lab] + [fn(m) for _, fn, _ in cols])
    return rows, raw


COLS = [("Imports (TWh)", lambda m: m["imports_mwh"] / 1e6, f2), ("Net imp. (TWh)", lambda m: m["net_imports_mwh"] / 1e6, f2),
        ("Curtail. (GWh)", lambda m: (m["pv_curtail_mwh"] + m["wind_curtail_mwh"]) / 1e3, f1),
        ("Batt. cycles", lambda m: m["battery_cycles"], f1), ("ENS (MWh)", lambda m: m["ens_mwh"], f0),
        ("Opex (MEUR/yr)", lambda m: m["opex_keur_annualised"] / 1e3, f1)]


def t_CDE() -> None:
    for name, tags, cap in (
        ("exp-C", [(f"{sc}|pv{pv}", f"{lab}, PV {300 + pv} MW") for sc, lab in (("normal", "Normal"), ("severe_drought", "Severe"))
                   for pv in (0, 500, 1000, 1500)], "Experiment C: PV additions without storage (annual, hourly)."),
        ("exp-D", [(f"{sc}|b{bp}/{be}", f"{lab}, {bp} MW / {be} MWh") for sc, lab in (("normal", "Normal"), ("severe_drought", "Severe"))
                   for bp, be in ((0, 0), (200, 800), (400, 1600), (800, 3200))],
         "Experiment D: battery storage without new renewables (annual, hourly)."),
        ("exp-E", [(f"{sc}|{k}", f"{lab}, {k}") for sc, lab in (("normal", "Normal"), ("severe_drought", "Severe"))
                   for k in ("baseline", "pv+1000", "batt400/1600", "pv+1000&batt", "pv+1000&wind300", "pv+1000&wind300&batt")],
         "Experiment E: coordinated portfolios (fixed fleets, annual hourly dispatch). Battery = 400 MW / 1600 MWh.")):
        d = load(name)
        if not d:
            continue
        rows, raw = _rows(d, tags, COLS)
        write(f"tab_{name.replace('-', '_')}", ["Case"] + [c[0] for c in COLS], [[esc(r[0])] + r[1:] for r in rows], cap,
              f"tab:{name}", raw_rows=raw, size=r"\footnotesize")


def t_FG() -> None:
    d = load("exp-F")
    if d:
        tags = [(f"price{m}", f"Import price ×{m}") for m in (1.0, 1.5, 2.0, 2.5, 3.0)]
        tags += [(f"avail{a}", f"NTC avail. {a:.0%}, +8\\% demand") for a in (1.0, 0.75, 0.5, 0.35, 0.25)]
        tags += [(f"avail{a}|batt", f"NTC {a:.0%}, +8\\% dem., battery 400/1600") for a in (0.5, 0.35, 0.25)]
        cols = COLS[:2] + [("LOLH (h)", lambda m: m["lol_hours"], f0), COLS[4],
                           ("Cost (MEUR/yr)", lambda m: m["total_cost_keur_annualised"] / 1e3, f1)]
        rows, raw = _rows(d, tags, cols)
        write("tab_exp_F", ["Case (severe drought)"] + [c[0] for c in cols], rows,
              "Experiment F: import price shocks and interconnector derating under severe drought (annual, hourly).",
              "tab:exp-F", raw_rows=raw, size=r"\footnotesize")
    d = load("exp-G")
    if d:
        tags = [(f"g{g}|a{a}", f"growth {g:.0%}, NTC {a:.0%}") for a in (1.0, 0.5) for g in (0.0, 0.1, 0.2, 0.3)]
        cols = COLS[:1] + [("LOLH (h)", lambda m: m["lol_hours"], f0), COLS[4],
                           ("Peak short. (MW)", lambda m: m["peak_shortfall_mw"], f0),
                           ("Cost (MEUR/yr)", lambda m: m["total_cost_keur_annualised"] / 1e3, f1)]
        rows, raw = _rows(d, tags, cols)
        write("tab_exp_G", ["Case (severe drought)"] + [c[0] for c in cols], [[esc(r[0])] + r[1:] for r in rows],
              "Experiment G: demand growth stress test under severe drought (annual, hourly).", "tab:exp-G", raw_rows=raw,
              size=r"\footnotesize")


def t_strategies() -> None:
    d = load("ref-H-frontier")
    if not d:
        return
    rows, raw = [], []
    for s in d["strategies"]:
        a, e = s["additions"], s["expected"]
        sev = s["by_scenario"].get("severe_drought", {})
        rows.append([esc(s["name"]), f0(a["pv"]), f0(a["wind"]), f0(a["bp"]), f0(a["be"]), f0(s["capex_overnight_meur"]),
                     f1(e["total_cost_keur_annualised"] / 1e3), f2(e["imports_mwh"] / 1e6),
                     f1(sev.get("total_cost_keur_annualised", 0) / 1e3), r"$\bullet$" if s["pareto"] else ""])
        raw.append([s["name"], a["pv"], a["wind"], a["bp"], a["be"], s["capex_overnight_meur"], e["total_cost_keur_annualised"],
                    e["imports_mwh"], sev.get("total_cost_keur_annualised"), s["pareto"]])
    write("tab_strategies", ["Strategy", "+PV", "+Wind", "+B MW", "+B MWh", "Capex", "E[cost]", "E[imp.]", "Cost sev.", "ND"],
          rows, "Investment strategies evaluated on the five-scenario set (representative weeks, hourly). Additions in "
          "MW/MWh, overnight capex in MEUR, expected total annualised cost and severe-drought cost in MEUR/yr, expected "
          "imports in TWh/yr; ND marks the non-dominated set in (expected cost, expected imports).", "tab:strategies",
          colspec="p{4.2cm}rrrrrrrrc", raw_rows=raw, size=r"\scriptsize")


def t_stochastic() -> None:
    d, rs = load("ref-I-stochastic"), load("exp-I-risk-sweep")
    if d and d.get("deterministic_comparison"):
        c = d["deterministic_comparison"]
        a, b = d["additions"], c["deterministic_plan_additions"]
        rows = [["Stochastic (RP), $\\lambda$=1", f0(a["pv"]), f0(a["wind"]), f0(a["bp"]), f0(a["be"]),
                 f1(c["rp_expected_cost_keur"] / d["horizon"]["weight_of_year"] / 1e3), f1(c["rp_cvar_keur_annualised"] / 1e3)],
                ["Deterministic (normal year)", f0(b["pv"]), f0(b["wind"]), f0(b["bp"]), f0(b["be"]),
                 f1(c["eev_expected_cost_keur"] / d["horizon"]["weight_of_year"] / 1e3), f1((c["eev_cvar_keur_annualised"] or 0) / 1e3)]]
        write("tab_stochastic", ["Plan", "+PV", "+Wind", "+B MW", "+B MWh", "E[cost]", "CVaR$_{0.9}$"], rows,
              f"Two-stage stochastic versus deterministic planning (budget 500 MEUR). E[cost]: expected total annualised "
              f"cost (MEUR/yr) evaluated on all five scenarios; CVaR of operating cost (MEUR/yr). "
              f"VSS = {c['vss_keur_annualised'] / 1e3:.2f} MEUR/yr; EVPI = {c['evpi_keur_annualised'] / 1e3:.2f} MEUR/yr.",
              "tab:stochastic")
    if rs:
        rows, raw = [], []
        for r in rs["rows"]:
            if r["status"] != "Optimal":
                continue
            a = r["additions"]
            e = r["objective_keur_annualised"] - r["lambda"] * r["risk"]["cvar_keur_annualised"]
            rows.append([f2(r["lambda"]), f0(r.get("budget_meur", 500)), f0(a["pv"]), f0(a["wind"]), f0(a["bp"]), f0(a["be"]),
                         f1(e / 1e3), f1(r["risk"]["cvar_keur_annualised"] / 1e3), f1(r["seconds"])])
            raw.append([r["lambda"], r.get("budget_meur", 500), a["pv"], a["wind"], a["bp"], a["be"], e,
                        r["risk"]["cvar_keur_annualised"], r["seconds"]])
        write("tab_risk_sweep", ["$\\lambda$", "Budget", "+PV", "+Wind", "+B MW", "+B MWh", "E[cost]", "CVaR$_{0.9}$", "Time (s)"],
              rows, "Risk-weight sweep of the two-stage programme ($\\alpha=0.9$). Costs in MEUR/yr; time is wall-clock for "
              "both boundary passes.", "tab:risk-sweep", raw_rows=raw, size=r"\footnotesize")


def t_marginal() -> None:
    d = load("ref-J-marginal")
    if not d:
        return
    rows, raw = [], []
    for r in d["rows"]:
        rows.append([esc(r["resource"].replace("_", " ")), esc(r["scenario"].replace("_", " ")), r["unit"].replace("hm3", "hm$^3$"),
                     f1(r["fd_right_keur_per_unit_yr"]), f1(r["fd_left_keur_per_unit_yr"]), f1(r["dual_keur_per_unit_yr"]),
                     "yes" if r["dual_reliable"] else "no", f1(r["annualised_cost_keur_per_unit_yr"])])
        raw.append([r[k] for k in ("resource", "scenario", "unit", "fd_right_keur_per_unit_yr", "fd_left_keur_per_unit_yr",
                                   "dual_keur_per_unit_yr", "dual_reliable", "annualised_cost_keur_per_unit_yr")])
    write("tab_marginal", ["Resource", "Scenario", "Unit", "$\\Delta^+$", "$\\Delta^-$", "Dual", "Dual valid", "Ann. cost"], rows,
          "Marginal operating value of flexibility (kEUR per unit per year) around the base fleet (PV 300 MW, battery "
          "200 MW/800 MWh, NTC 900 MW, $V^{\\max}$ 2400 hm$^3$). $\\Delta^+$: value of adding the next increment; "
          "$\\Delta^-$: value of the last increment. Ann. cost: annualised cost of one more unit.", "tab:marginal",
          raw_rows=raw, size=r"\footnotesize")


def t_validation() -> None:
    d = load("exp-validation")
    if not d:
        return
    rows, raw = [], []
    for r in d["rows"]:
        rows.append([esc(r["scenario"].replace("_", " ")), f0(r["hours"]), "yes" if r["investment"] else "no",
                     f2(r["native_objective_keur"]), f2(r["pypsa_objective_keur"]), f"{r['rel_diff']:.1e}",
                     f"{r['reservoir_max_abs_diff_hm3']:.2e}", f2(r["native_seconds"]), f2(r["pypsa_seconds"])])
        raw.append([r[k] for k in ("scenario", "hours", "investment", "native_objective_keur", "pypsa_objective_keur",
                                   "rel_diff", "reservoir_max_abs_diff_hm3", "native_seconds", "pypsa_seconds")])
    write("tab_validation", ["Scenario", "Hours", "Invest", "Native (kEUR)", "PyPSA (kEUR)", "Rel. diff.", "max$|\\Delta V|$",
                             "t native", "t PyPSA"], rows,
          "Independent verification of the native sparse LP against a PyPSA/linopy formulation of the same system (both "
          "solved with HiGHS). Times in seconds include model construction. Reservoir trajectories may differ where the "
          "LP optimum is not unique.", "tab:validation", raw_rows=raw, size=r"\footnotesize")


def t_solver() -> None:
    rows, raw = [], []
    for rid, lab in (("ref-A-normal-annual", "Annual dispatch, hourly"), ("ref-I-stochastic", "Stochastic, 8 weeks × 5 scen.")):
        d = load(rid)
        if not d:
            continue
        s = d["solver"]
        rows.append([lab, s["method"], f0(s["n_vars"]), f0(s["n_rows"]), f0(s["n_nonzeros"]), f2(s["solve_seconds"]),
                     f0(s["iterations"]["simplex"]), f0(s["iterations"]["ipm"]), esc(s["status"])])
        raw.append([lab, s["method"], s["n_vars"], s["n_rows"], s["n_nonzeros"], s["solve_seconds"], s["iterations"]["simplex"],
                    s["iterations"]["ipm"], s["status"]])
    sw = load("exp-H-budget-sweep")
    if sw:
        r = next((x for x in sw["rows"] if x["budget_meur"] == 500), None)
        if r:
            s = r["solver"]
            rows.append(["Investment, 8 weeks, normal", s["method"], f0(s["n_vars"]), f0(s["n_rows"]), f0(s["n_nonzeros"]),
                         f2(s["solve_seconds"]), f0(s["iterations"]["simplex"]), f0(s["iterations"]["ipm"]), esc(s["status"])])
    write("tab_solver", ["Problem", "Method", "Vars", "Rows", "Non-zeros", "Solve (s)", "Simplex it.", "IPM it.", "Status"],
          rows, "Solver diagnostics (HiGHS via highspy) for representative problems.", "tab:solver", raw_rows=raw,
          size=r"\footnotesize")


def t_data_dictionary() -> None:
    rows = []
    for f in sorted((REPO_ROOT / "data" / "provenance").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        nature = d["nature"] if isinstance(d["nature"], str) else "mixed (see record)"
        rows.append([esc(d["dataset_id"]), esc(d["provider"][:48]), esc(d["temporal_resolution"]), esc(d["time_coverage"][:30]),
                     esc(nature[:60])])
    write("tab_data_dictionary", ["Dataset id", "Provider", "Resolution", "Coverage", "Nature"], rows,
          "Data dictionary: machine-readable provenance records in \\texttt{data/provenance/}.", "tab:data-dictionary",
          colspec="p{3.6cm}p{3.4cm}p{1.3cm}p{2.6cm}p{3.6cm}", size=r"\scriptsize")


def main() -> None:
    print("tables:")
    for f in (t_assumptions, t_scenarios, t_annual, t_CDE, t_FG, t_strategies, t_stochastic, t_marginal, t_validation,
              t_solver, t_data_dictionary):
        try:
            f()
        except Exception as exc:
            print(f"  FAILED {f.__name__}: {exc!r}")


if __name__ == "__main__":
    main()
