"""Publication figures generated exclusively from results/experiments/*.json and processed input data.

    python -m hydroflex.experiments.figures
Writes vector PDF + PNG to research/paper/figures/ (copied to research/figures/ for the poster).
"""

from __future__ import annotations

import json
import shutil

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Polygon  # noqa: E402

from hydroflex import DATA_DIR, REPO_ROOT, RESULTS_DIR  # noqa: E402

EXP = RESULTS_DIR / "experiments"
FIG = REPO_ROOT / "research" / "paper" / "figures"
C = {"hydro": "#0E7490", "ror": "#14B8A6", "pv": "#F2A900", "wind": "#10B981", "battery": "#7C3AED",
     "imports": "#64748B", "unserved": "#DC2626", "exports": "#94A3B8", "charge": "#A78BFA", "demand": "#0F172A",
     "money": "#B7791F", "risk": "#7C3AED"}
SCEN_C = {"normal": "#0E7490", "moderate_drought": "#B7791F", "severe_drought": "#DC2626", "compound_shock": "#7C3AED",
          "wet_year": "#2563EB", "dry_year": "#D97706"}
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8.5, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.titlesize": 9, "axes.labelsize": 8.5, "legend.fontsize": 7.5,
                     "legend.frameon": False, "figure.dpi": 150, "savefig.bbox": "tight", "axes.grid": True,
                     "grid.alpha": 0.25, "grid.linewidth": 0.5})


def load(name: str) -> dict | None:
    f = EXP / f"{name}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def save(fig: plt.Figure, name: str) -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    fig.savefig(FIG / f"{name}.pdf")
    fig.savefig(FIG / f"{name}.png", dpi=220)
    plt.close(fig)
    print("  figure", name)


def _ts(d: dict, key: str) -> tuple[pd.DatetimeIndex, dict[str, np.ndarray]]:
    t = pd.to_datetime(d["timeseries"]["timestamps"])
    s = {k: np.asarray(v, dtype=float) for k, v in d["timeseries"]["scenarios"][key].items()}
    return t, s


# ---------------------------------------------------------------------------------------------
def fig_architecture() -> None:
    fig, ax = plt.subplots(figsize=(7.2, 3.3))
    ax.set_axis_off()
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 46)

    def box(x, y, w, h, title, body, color):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2", fc=color + "18",
                                    ec=color, lw=1.0))
        ax.text(x + w / 2, y + h - 2.2, title, ha="center", va="top", fontsize=8, weight="bold", color=color)
        ax.text(x + w / 2, y + h - 5.6, body, ha="center", va="top", fontsize=6.4, color="#1F2937", linespacing=1.35)

    box(1, 25, 22, 19, "Data layer", "NASA POWER hourly\n(irradiance, T, wind)\nNASA POWER daily\nprecipitation 2000–23\n"
                                     "Open-Meteo ERA5 (check)", "#2563EB")
    box(1, 2, 22, 19, "Profile models", "PV: PVWatts-type\nWind: power curve\nInflow: snow + linear\nreservoirs "
                                       "(reconstructed)\nDemand/prices: SYNTHETIC", "#0E7490")
    box(28, 25, 22, 19, "Scenario engine", "Normal · moderate ·\nsevere drought ·\ncompound shock\n5-scenario stochastic set\n"
                                          "(23 reconstructed years)", "#B7791F")
    box(28, 2, 22, 19, "LP formulation", "Energy balance\nReservoir water balance\nBattery SOC dynamics\nImports/exports, "
                                        "VOLL\nBudget, CVaR rows", "#7C3AED")
    box(55, 25, 20, 19, "Solvers", "Native sparse LP\n→ HiGHS (highspy)\n\nPyPSA + linopy\n→ HiGHS (cross-check)", "#059669")
    box(55, 2, 20, 19, "Analytics", "Reliability metrics\nShadow prices / duals\nFinite differences\nPareto frontier\n"
                                    "VSS, EVPI, regret", "#DC2626")
    box(80, 13.5, 19, 19, "Outputs", "FastAPI service\nReact digital twin\nExperiment registry\nPaper figures/tables\n"
                                     "Provenance records", "#0F172A")
    arrows = [((23, 34.5), (28, 34.5)), ((12, 25), (12, 21)), ((23, 11.5), (28, 11.5)), ((39, 25), (39, 21)),
              ((50, 11.5), (55, 11.5)), ((50, 34.5), (55, 34.5)), ((65, 21), (65, 25)), ((75, 34.5), (80, 27)),
              ((75, 11.5), (80, 19))]
    for a, b in arrows:
        ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=8, color="#475569", lw=0.9))
    save(fig, "fig01_architecture")


def fig_study_context() -> None:
    gj = DATA_DIR / "processed" / "balkans_ne50m.geojson"
    if not gj.exists():
        return
    feats = json.loads(gj.read_text(encoding="utf-8"))["features"]
    fig, ax = plt.subplots(figsize=(4.3, 5.4))
    for f in feats:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        al = f["properties"]["name"] == "Albania"
        for poly in polys:
            ring = np.asarray(poly[0])
            ax.add_patch(Polygon(ring, closed=True, fc="#E0F2FE" if al else "#F1F5F9", ec="#0F172A" if al else "#94A3B8",
                                 lw=0.9 if al else 0.5, zorder=2 if al else 1))
    nodes = [("Fierza", 42.25, 20.04, "hydro"), ("Koman", 42.10, 19.82, "hydro"), ("Vau i Dejës", 42.01, 19.63, "hydro"),
             ("Devoll cascade", 40.95, 20.25, "ror"), ("Fier / Karavasta PV", 40.92, 19.50, "pv"),
             ("Tirana (load)", 41.33, 19.82, "demand"), ("Vlorë coast (wind pts)", 40.40, 19.35, "wind"),
             ("Lezhë coast (wind pt)", 41.78, 19.60, "wind")]
    for name, lat, lon, kind in nodes:
        ax.scatter(lon, lat, s=34 if kind != "demand" else 46, color=C.get(kind, "#0F172A"),
                   marker="o" if kind != "demand" else "s", zorder=5, edgecolor="white", lw=0.6)
        ax.text(lon + 0.06, lat + 0.03, name, fontsize=6.3, zorder=6)
    basin = [(42.55, 20.55), (41.55, 20.55), (42.10, 20.40), (42.05, 19.85)]
    for lat, lon in basin:
        ax.scatter(lon, lat, marker="x", s=18, color="#2563EB", zorder=5, lw=0.9)
    for name, lat, lon in (("Montenegro", 42.45, 19.25), ("Kosovo", 42.55, 20.95), ("N. Macedonia", 41.45, 21.0),
                           ("Greece", 39.85, 20.75), ("Adriatic Sea", 41.2, 18.85), ("Ionian Sea", 39.75, 19.3)):
        ax.text(lon, lat, name, fontsize=6.3, color="#64748B", style="italic", ha="center")
    ax.set_xlim(18.6, 21.4)
    ax.set_ylim(39.55, 42.85)
    ax.set_aspect(1 / np.cos(np.deg2rad(41.2)))
    ax.set_xlabel("longitude (°E)")
    ax.set_ylabel("latitude (°N)")
    from matplotlib.lines import Line2D

    h = [Line2D([], [], marker="o", ls="", color=C["hydro"], label="Drin cascade HPP (approx.)"),
         Line2D([], [], marker="o", ls="", color=C["ror"], label="other hydro (approx.)"),
         Line2D([], [], marker="o", ls="", color=C["pv"], label="solar resource point"),
         Line2D([], [], marker="o", ls="", color=C["wind"], label="wind resource point"),
         Line2D([], [], marker="x", ls="", color="#2563EB", label="basin precipitation point"),
         Line2D([], [], marker="s", ls="", color="#0F172A", label="demand temperature proxy")]
    ax.legend(handles=h, loc="lower left", fontsize=6.2, frameon=True, framealpha=0.9)
    ax.set_title("Study area (Natural Earth 1:50m); locations approximate")
    save(fig, "fig02_study_context")


def fig_profiles() -> None:
    summ = json.loads((DATA_DIR / "processed" / "profile_summary.json").read_text(encoding="utf-8"))
    y = summ["reference_year"]
    df = pd.read_csv(DATA_DIR / "processed" / f"hourly_profiles_{y}.csv", index_col=0, parse_dates=True)
    d = df.resample("D").mean()
    idx = pd.read_csv(DATA_DIR / "processed" / "annual_inflow_index.csv", index_col=0).iloc[:, 0]
    fig, axs = plt.subplots(2, 2, figsize=(7.2, 4.6))
    ax = axs[0, 0]
    ax.plot(d.index, d.pv_cf, color=C["pv"], lw=0.9, label="PV")
    ax.plot(d.index, d.wind_cf, color=C["wind"], lw=0.9, label="wind")
    ax.set_ylabel("daily mean capacity factor (–)")
    ax.set_title(f"(a) Weather-derived capacity factors, {y}")
    ax.legend()
    ax = axs[0, 1]
    ax.plot(d.index, d.demand_mw, color=C["demand"], lw=0.9)
    ax.set_ylabel("daily mean demand (MW)")
    ax.set_title("(b) Synthetic temperature-driven demand")
    ax2 = ax.twinx()
    ax2.plot(d.index, d.t2m_tirana_c, color="#DC2626", lw=0.6, alpha=0.6)
    ax2.set_ylabel("Tirana T2M (°C)", color="#DC2626")
    ax2.grid(False)
    ax = axs[1, 0]
    ax.fill_between(d.index, d.drin_inflow_hm3_per_h * 24, color=C["hydro"], alpha=0.35, lw=0)
    ax.plot(d.index, d.drin_inflow_hm3_per_h * 24, color=C["hydro"], lw=0.8, label="Drin inflow (hm³/day)")
    ax.set_ylabel("reconstructed inflow (hm³/day)")
    ax3 = ax.twinx()
    ax3.plot(d.index, d.ror_avail_mw, color=C["ror"], lw=0.8)
    ax3.set_ylabel("run-of-river availability (MW)", color=C["ror"])
    ax3.grid(False)
    ax.set_title("(c) Reconstructed hydrology (not gauged)")
    for a in (axs[0, 0], axs[0, 1], axs[1, 0]):
        a.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
    ax = axs[1, 1]
    cols = ["#DC2626" if v < 0.9 else ("#2563EB" if v > 1.1 else "#94A3B8") for v in idx.values]
    ax.bar(idx.index, idx.values, color=cols)
    ax.axhline(1, color="#0F172A", lw=0.7)
    ax.axhline(0.78, color="#B7791F", lw=0.7, ls="--")
    ax.axhline(0.60, color="#DC2626", lw=0.7, ls=":")
    ax.text(2000.6, 0.795, "moderate drought (0.78)", fontsize=6, color="#B7791F")
    ax.text(2000.6, 0.615, "severe drought (0.60)", fontsize=6, color="#DC2626")
    ax.set_ylim(0.5, max(1.45, float(idx.max()) + 0.05))
    ax.set_title("(d) Annual inflow index 2001–2023 (reconstructed)")
    ax.set_ylabel("annual inflow / mean (–)")
    fig.tight_layout()
    save(fig, "fig03_profiles")


def _stack(ax, t, s, title, ylim=None, legend=False):
    layers = [("hydro", "reservoir hydro", C["hydro"]), ("ror", "run-of-river", C["ror"]), ("pv", "solar", C["pv"]),
              ("wind", "wind", C["wind"]), ("battery_discharge", "battery", C["battery"]), ("imports", "imports", C["imports"]),
              ("unserved", "unserved", C["unserved"])]
    ys = [s[k] for k, _, _ in layers]
    ax.stackplot(t, *ys, colors=[c for _, _, c in layers], labels=[lab for _, lab, _ in layers], lw=0, alpha=0.9)
    ax.stackplot(t, -s["exports"], -s["battery_charge"], colors=[C["exports"], C["charge"]], labels=["exports", "charging"],
                 lw=0, alpha=0.8)
    ax.plot(t, s["demand"], color=C["demand"], lw=0.9, label="demand")
    ax.axhline(0, color="#0F172A", lw=0.4)
    ax.set_title(title)
    ax.set_ylabel("MW")
    if ylim:
        ax.set_ylim(*ylim)
    ax.xaxis.set_major_locator(mdates.DayLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d"))
    ax.set_xlabel("day of month (UTC)", fontsize=7)


def fig_dispatch() -> None:
    a, b = load("ref-A-normal-annual"), load("ref-B-severe-annual")
    if not (a and b):
        return
    fig, axs = plt.subplots(2, 2, figsize=(7.2, 4.8), sharey=True)
    for col, (d, key, lab) in enumerate(((a, "normal", "Normal"), (b, "severe_drought", "Severe drought"))):
        t, s = _ts(d, key)
        for row, (d0, name) in enumerate(((14, "winter week (15–21 Jan)"), (196, "summer week (16–22 Jul)"))):
            sl = slice(d0 * 24, d0 * 24 + 168)
            ss = {k: v[sl] for k, v in s.items()}
            _stack(axs[row, col], t[sl], ss, f"{lab}: {name}", ylim=(-1000, 2400))
    h, lab_ = axs[0, 0].get_legend_handles_labels()
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.legend(h, lab_, ncol=5, loc="lower center", fontsize=6.8)
    save(fig, "fig04_dispatch_normal_vs_drought")


def fig_reservoir() -> None:
    runs = [("ref-A-normal-annual", "normal", "Normal"), ("ref-B-moderate-annual", "moderate_drought", "Moderate drought"),
            ("ref-B-severe-annual", "severe_drought", "Severe drought"), ("ref-F-compound-annual", "compound_shock", "Compound shock")]
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.8))
    for rid, key, lab in runs:
        d = load(rid)
        if not d:
            continue
        t, s = _ts(d, key)
        axs[0].plot(t, s["reservoir_hm3"], color=SCEN_C[key], lw=1.0, label=lab)
        daily = pd.Series(s["hydro"], index=t).resample("D").mean()
        axs[1].plot(daily.index, daily.values, color=SCEN_C[key], lw=0.7, label=lab)
    axs[0].axhline(600, color="#0F172A", lw=0.6, ls="--")
    axs[0].axhline(2400, color="#0F172A", lw=0.6, ls="--")
    axs[0].text(t[100], 640, "V_min", fontsize=6.5)
    axs[0].text(t[100], 2300, "V_max", fontsize=6.5)
    axs[0].set_ylabel("reservoir volume (hm³)")
    axs[0].set_title("(a) Aggregated Drin reservoir trajectory")
    axs[1].set_ylabel("daily mean reservoir hydro output (MW)")
    axs[1].set_title("(b) Reservoir hydro dispatch")
    axs[0].legend(loc="lower left")
    for ax in axs:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
    fig.tight_layout()
    save(fig, "fig05_reservoir")


def fig_battery() -> None:
    d = load("ref-E-coordinated-normal")
    if not d:
        return
    t, s = _ts(d, "normal")
    fig, axs = plt.subplots(2, 1, figsize=(7.2, 3.6), sharex=True)
    sl = slice(196 * 24, 196 * 24 + 168)
    axs[0].fill_between(t[sl], s["soc_mwh"][sl], color=C["battery"], alpha=0.3, lw=0)
    axs[0].plot(t[sl], s["soc_mwh"][sl], color=C["battery"], lw=1)
    axs[0].axhline(1600, color="#0F172A", lw=0.5, ls="--")
    axs[0].axhline(80, color="#0F172A", lw=0.5, ls=":")
    axs[0].set_ylabel("SOC (MWh)")
    axs[0].set_title("Coordinated fleet (PV 1300 MW, wind 300 MW, battery 400 MW / 1600 MWh), normal year, 16–22 Jul")
    axs[1].bar(t[sl], s["battery_discharge"][sl], width=1 / 24, color=C["battery"], label="discharge")
    axs[1].bar(t[sl], -s["battery_charge"][sl], width=1 / 24, color=C["charge"], label="charge")
    ax2 = axs[1].twinx()
    ax2.plot(t[sl], s["price_eur_mwh"][sl], color=C["money"], lw=0.9, label="shadow price")
    ax2.set_ylabel("shadow price (EUR/MWh)", color=C["money"])
    ax2.grid(False)
    axs[1].set_ylabel("MW")
    axs[1].legend(loc="upper left", ncol=2)
    axs[1].xaxis.set_major_formatter(mdates.DateFormatter("%d %b"))
    fig.tight_layout()
    save(fig, "fig06_battery_soc")


def fig_imports() -> None:
    sens = load("ref-sensitivity")
    f = load("exp-F")
    g = load("exp-G")
    if not sens:
        return
    fig, axs = plt.subplots(1, 3, figsize=(7.2, 2.6))
    sw = pd.DataFrame(sens["drought_sweep"])
    for a, ls in ((1.0, "-"), (0.5, "--")):
        q = sw[sw.import_availability == a]
        axs[0].plot(q.severity, q.imports_mwh / 1e6, ls=ls, color=C["imports"], label=f"imports, NTC avail. {a:.0%}")
        axs[0].plot(q.severity, q.net_imports_mwh / 1e6, ls=ls, color=C["hydro"], label=f"net imports, {a:.0%}")
    axs[0].set_xlabel("drought severity d (inflow ×(1−d))")
    axs[0].set_ylabel("TWh / yr")
    axs[0].set_title("(a) Import dependence vs drought")
    axs[0].legend(fontsize=5.8)
    for a, ls in ((1.0, "-"), (0.5, "--")):
        q = sw[sw.import_availability == a]
        axs[1].plot(q.severity, q.ens_mwh / 1e3, ls=ls, color=C["unserved"], label=f"NTC avail. {a:.0%}")
    axs[1].set_xlabel("drought severity d")
    axs[1].set_ylabel("unserved energy (GWh / yr)")
    axs[1].set_title("(b) Reliability vs drought")
    axs[1].legend()
    if g:
        rows = [r for r in g["rows"] if r["optimal"]]
        for a, ls in (("1.0", "-"), ("0.5", "--")):
            q = [r for r in rows if r["tag"].endswith("|a" + a)]
            xs = [float(r["tag"].split("|")[0][1:]) for r in q]
            axs[2].plot(xs, [r["metrics"]["ens_mwh"] / 1e3 for r in q], ls=ls, marker="o", ms=3, color=C["unserved"],
                        label=f"NTC avail. {float(a):.0%}")
        axs[2].set_xlabel("demand growth (–)")
        axs[2].set_ylabel("unserved energy (GWh / yr)")
        axs[2].set_title("(c) Demand growth, severe drought")
        axs[2].legend()
    fig.tight_layout()
    save(fig, "fig07_imports_reliability")
    if f:
        rows = [r for r in f["rows"] if r["optimal"] and r["tag"].startswith("price")]
        fig, ax = plt.subplots(figsize=(3.5, 2.4))
        ax.plot([float(r["tag"][5:]) for r in rows], [r["metrics"]["total_cost_keur_annualised"] / 1e3 for r in rows],
                marker="o", color=C["money"])
        ax.set_xlabel("import price multiplier")
        ax.set_ylabel("annual system cost (MEUR)")
        ax.set_title("Import price shock, severe drought")
        save(fig, "fig07b_price_shock")


def fig_frontier() -> None:
    d = load("ref-H-frontier")
    if not d:
        return
    st = d["strategies"]
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 3.2))
    fam_c = {"baseline": "#0F172A", "solar": C["pv"], "wind": C["wind"], "battery": C["battery"],
             "coordinated": C["hydro"], "robust": "#DB2777", "budget_sweep": "#94A3B8"}
    for s in st:
        x = s["expected"]["total_cost_keur_annualised"] / 1e3
        y = s["expected"]["imports_mwh"] / 1e6
        axs[0].scatter(x, y, s=40 if s["pareto"] else 22, color=fam_c[s["family"]], edgecolor="#0F172A" if s["pareto"] else "none",
                       lw=0.8, zorder=3)
    groups: dict = {}
    for s in st:
        if s["family"] == "budget_sweep" or s["id"].startswith("R_"):
            continue
        key = (round(s["expected"]["total_cost_keur_annualised"]), round(s["expected"]["imports_mwh"]))
        groups.setdefault(key, []).append(s)
    for g in groups.values():
        s0 = g[0]
        lab = " = ".join(x["id"].split("_")[0] for x in g)
        if len(g) == 1:
            lab = s0["name"].split(" (")[0]
        axs[0].annotate(lab, (s0["expected"]["total_cost_keur_annualised"] / 1e3, s0["expected"]["imports_mwh"] / 1e6),
                        fontsize=6, xytext=(4, 4), textcoords="offset points")
    sweep = sorted([s for s in st if s["family"] == "budget_sweep" or s["id"] == "E_coordinated"],
                   key=lambda s: s["capex_overnight_meur"])
    axs[0].plot([s["expected"]["total_cost_keur_annualised"] / 1e3 for s in sweep],
                [s["expected"]["imports_mwh"] / 1e6 for s in sweep], color="#94A3B8", lw=0.6, zorder=1,
                label="deterministic budget sweep (100–2000 MEUR)")
    pf = sorted([s for s in st if s["pareto"]], key=lambda s: s["expected"]["total_cost_keur_annualised"])
    axs[0].scatter([s["expected"]["total_cost_keur_annualised"] / 1e3 for s in pf], [s["expected"]["imports_mwh"] / 1e6 for s in pf],
                   s=90, facecolor="none", edgecolor="#0F172A", lw=1.0, zorder=4, label="non-dominated")
    axs[0].set_xlabel("expected total annualised cost (MEUR / yr)")
    axs[0].set_ylabel("expected imports (TWh / yr)")
    axs[0].set_title("(a) Cost–import-dependence frontier")
    axs[0].legend(loc="lower right", fontsize=6.2)
    keys = d["evaluation_scenarios"]
    main = [s for s in st if s["family"] != "budget_sweep" and not s["id"].startswith("R_")]
    w = 0.8 / len(keys)
    for i, k in enumerate(keys):
        axs[1].bar(np.arange(len(main)) + i * w, [s["by_scenario"][k]["total_cost_keur_annualised"] / 1e3 for s in main],
                   width=w, color=SCEN_C.get(k, "#94A3B8"), label=k.replace("_", " "))
    axs[1].set_xticks(np.arange(len(main)) + 0.4 - w / 2)
    axs[1].set_xticklabels([s["id"].split("_")[0] for s in main])
    axs[1].set_ylabel("total annualised cost (MEUR / yr)")
    axs[1].set_title("(b) Strategy cost by scenario")
    axs[1].legend(fontsize=6, ncol=2)
    fig.tight_layout()
    save(fig, "fig08_investment_frontier")


def fig_cvar() -> None:
    ri = load("ref-I-stochastic")
    rs = load("exp-I-risk-sweep")
    if not (ri and rs):
        return
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 2.8))
    sc = ri["scenarios"]
    xs = np.arange(len(sc))
    axs[0].bar(xs, [s["opex_keur"] / 1e3 for s in sc], color=[SCEN_C.get(s["key"], "#94A3B8") for s in sc])
    for i, s in enumerate(sc):
        axs[0].text(i, s["opex_keur"] / 1e3, f"p={s['probability']:.2f}", ha="center", va="bottom", fontsize=6)
    r = ri["risk"]
    axs[0].axhline(r["var_keur_annualised"] / 1e3, color="#0F172A", ls="--", lw=0.7, label="VaR$_{0.9}$")
    axs[0].axhline(r["cvar_keur_annualised"] / 1e3, color=C["risk"], ls="-", lw=0.9, label="CVaR$_{0.9}$")
    axs[0].axhline(r["expected_loss_keur_annualised"] / 1e3, color=C["money"], ls=":", lw=0.9, label="expectation")
    axs[0].set_xticks(xs)
    axs[0].set_xticklabels([s["key"].replace("_", "\n") for s in sc], fontsize=6.5)
    axs[0].set_ylabel("annual operating cost (MEUR / yr)")
    axs[0].set_title("(a) Scenario operating costs, stochastic plan (λ=1)")
    axs[0].legend(fontsize=6)
    i2 = load("exp-I2-conditions")
    if i2:
        for exp_cap, bud, mk in ((300.0, 1500.0, "o"), (300.0, 1000.0, "s"), (900.0, 1500.0, "^")):
            rr = [x for x in i2["rows"] if x["export_capacity_mw"] == exp_cap and x["budget_meur"] == bud]
            if not rr:
                continue
            r0 = rr[0]
            pts = [("deterministic", r0["eev_cvar_keur_annualised"], r0["eev_expected_cost_keur_annualised"])]
            pts += [(f"stoch. λ={x['lambda']:g}", x["rp_cvar_keur_annualised"], x["rp_expected_cost_keur_annualised"]) for x in rr]
            col = {300.0: C["risk"], 900.0: C["hydro"]}[exp_cap]
            axs[1].plot([p[1] / 1e3 for p in pts], [p[2] / 1e3 for p in pts], marker=mk, color=col, lw=0.8, ms=5,
                        label=f"export {exp_cap:.0f} MW, budget {bud:.0f} MEUR")
            for lab, xx, yy in pts:
                if exp_cap == 300.0 and bud == 1500.0:
                    axs[1].annotate(lab, (xx / 1e3, yy / 1e3), fontsize=6, textcoords="offset points",
                                    xytext=(4, -10) if lab == "deterministic" else ((-40, 6) if "=0" in lab else (4, 3)))
        axs[1].legend(fontsize=6)
    axs[1].set_xlabel("CVaR$_{0.9}$ of operating cost (MEUR / yr)")
    axs[1].set_ylabel("expected total cost (MEUR / yr)")
    axs[1].set_title("(b) Risk–cost trade-off (Experiment I2)")
    fig.tight_layout()
    save(fig, "fig09_cvar")


def fig_sensitivity() -> None:
    s = load("ref-sensitivity")
    if not s:
        return
    fig, axs = plt.subplots(1, 2, figsize=(7.2, 3.0), gridspec_kw={"width_ratios": [1.2, 1]})
    tor = sorted(s["tornado"], key=lambda r: abs(r["metric_high"] - r["metric_low"]))
    base = tor[0]["metric_base"]
    for i, r in enumerate(tor):
        lo, hi = (r["metric_low"] - base) / 1e3, (r["metric_high"] - base) / 1e3
        axs[0].barh(i, lo, color="#2563EB", alpha=0.8)
        axs[0].barh(i, hi, color="#DC2626", alpha=0.8)
    axs[0].set_yticks(range(len(tor)))
    axs[0].set_yticklabels([r["label"] for r in tor], fontsize=6.5)
    axs[0].axvline(0, color="#0F172A", lw=0.6)
    axs[0].set_xlabel("Δ optimal annual system cost vs base (MEUR / yr)")
    axs[0].set_title("(a) Tornado (blue: low, red: high)")
    h = s["heatmap"]
    z = np.asarray(h["z"], dtype=float) / 1e3
    vmax = np.nanmax(np.abs(z))
    im = axs[1].imshow(z, origin="lower", aspect="auto", cmap="RdBu", vmin=-vmax, vmax=vmax)
    axs[1].set_xticks(range(len(h["x"])))
    axs[1].set_xticklabels(h["x"])
    axs[1].set_yticks(range(len(h["y"])))
    axs[1].set_yticklabels(h["y"])
    for i in range(z.shape[0]):
        for j in range(z.shape[1]):
            axs[1].text(j, i, f"{z[i, j]:.1f}", ha="center", va="center", fontsize=6)
    axs[1].set_xlabel(h["x_label"])
    axs[1].set_ylabel(h["y_label"])
    axs[1].set_title("(b) Net battery benefit, NTC 60%")
    axs[1].grid(False)
    fig.colorbar(im, ax=axs[1], shrink=0.8)
    fig.tight_layout()
    save(fig, "fig10_sensitivity")


def fig_marginal() -> None:
    d = load("ref-J-marginal")
    if not d:
        return
    rows = d["rows"]
    res = ["battery_energy", "battery_power", "solar_pv", "wind", "import_capacity", "reservoir_volume"]
    scen = ["normal", "severe_drought", "compound_shock"]
    fig, axs = plt.subplots(1, len(res), figsize=(7.2, 2.4))
    for ax, r in zip(axs, res, strict=True):
        q = [x for x in rows if x["resource"] == r]
        for i, sc in enumerate(scen):
            x = next(v for v in q if v["scenario"] == sc)
            lo = x["fd_right_keur_per_unit_yr"]
            hi = x["fd_left_keur_per_unit_yr"] if x["fd_left_keur_per_unit_yr"] is not None else lo
            ax.vlines(i, min(lo, hi), max(lo, hi), color=SCEN_C[sc], lw=4, alpha=0.5)
            ax.scatter(i, x["dual_keur_per_unit_yr"], color=SCEN_C[sc], marker="D" if x["dual_reliable"] else "x", s=16,
                       zorder=3)
        cst = q[0]["annualised_cost_keur_per_unit_yr"]
        if cst:
            ax.axhline(cst, color="#0F172A", ls="--", lw=0.6)
        ax.set_xticks(range(3))
        ax.set_xticklabels(["N", "S", "C"])
        ax.set_title(r.replace("_", " ") + f"\n({q[0]['unit']})", fontsize=7)
    axs[0].set_ylabel("kEUR per unit per year")
    fig.suptitle("Marginal value: dual (◆) within finite-difference interval (bar); dashed = annualised cost", fontsize=7.5,
                 y=1.05)
    fig.tight_layout()
    save(fig, "fig11_marginal_value")


def fig_resolution() -> None:
    d = load("exp-resolution")
    if not d:
        return
    rows = {r["tag"]: r for r in d["rows"] if r["optimal"]}
    res = [1, 2, 3, 6]
    val = [rows[f"res{r}|nobatt"]["metrics"]["opex_keur_annualised"] - rows[f"res{r}"]["metrics"]["opex_keur_annualised"]
           for r in res if f"res{r}" in rows and f"res{r}|nobatt" in rows]
    fig, ax = plt.subplots(figsize=(3.4, 2.3))
    ax.bar([str(r) + " h" for r in res[:len(val)]], np.array(val) / 1e3, color=C["battery"])
    ax.set_ylabel("battery operating saving (MEUR / yr)")
    ax.set_xlabel("time-step length")
    ax.set_title("Storage value vs temporal resolution\n(400 MW / 1600 MWh, normal year)")
    save(fig, "fig12_resolution")


def main() -> None:
    print("figures:")
    for f in (fig_architecture, fig_study_context, fig_profiles, fig_dispatch, fig_reservoir, fig_battery, fig_imports,
              fig_frontier, fig_cvar, fig_sensitivity, fig_marginal, fig_resolution):
        try:
            f()
        except Exception as exc:  # report, keep going
            print(f"  FAILED {f.__name__}: {exc!r}")
    dst = REPO_ROOT / "research" / "figures"
    dst.mkdir(parents=True, exist_ok=True)
    for p in FIG.glob("*.png"):
        shutil.copy2(p, dst / p.name)


if __name__ == "__main__":
    main()
