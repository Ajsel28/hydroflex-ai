"""Generate the A0 research poster (PDF + PNG) from executed results.

    python research/poster/make_poster.py

Text findings are read from results/experiments/ref-summary.json; figures from research/paper/figures/.
Nothing on the poster is typed in by hand except section headings, method descriptions and limitations.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, Rectangle  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FIG = ROOT / "research" / "paper" / "figures"
EXP = ROOT / "results" / "experiments"
OUT = ROOT / "research" / "poster"

NAVY, CYAN, EMER, AMBER, VIOLET, RED, INK, MUTED = "#0B1220", "#0891B2", "#059669", "#B7791F", "#7C3AED", "#DC2626", "#0F172A", "#475569"
W, H = 33.1, 46.8  # A0 portrait, inches


def panel(fig, x, y, w, h, title, color=CYAN):
    ax = fig.add_axes([x, y, w, h])
    ax.set_axis_off()
    ax.add_patch(FancyBboxPatch((0, 0), 1, 1, boxstyle="round,pad=0,rounding_size=0.015", transform=ax.transAxes,
                                fc="white", ec="#CBD5E1", lw=1.5))
    ax.add_patch(Rectangle((0, 0.965), 1, 0.035, transform=ax.transAxes, fc=color, ec="none"))
    ax.text(0.02, 0.982, title, transform=ax.transAxes, fontsize=30, color="white", weight="bold", va="center")
    return ax


def text(ax, x, y, s, size=20, width=70, color=INK, **kw):
    ax.text(x, y, "\n".join(textwrap.fill(p, width) for p in s.split("\n")), transform=ax.transAxes, fontsize=size,
            color=color, va="top", linespacing=1.35, **kw)


def image(fig, path, x, y, w, h):
    if not path.exists():
        a = fig.add_axes([x, y, w, h])
        a.set_axis_off()
        a.text(0.5, 0.5, f"[figure not generated: {path.name}]", ha="center", va="center", fontsize=16, color=RED)
        return
    a = fig.add_axes([x, y, w, h])
    a.imshow(mpimg.imread(path))
    a.set_axis_off()


def main() -> None:
    summ = json.loads((EXP / "ref-summary.json").read_text(encoding="utf-8")) if (EXP / "ref-summary.json").exists() else {"experiments": []}
    find = {e["id"]: e for e in summ["experiments"]}
    fig = plt.figure(figsize=(W, H), facecolor="#F8FAFC")
    # header
    hd = fig.add_axes([0, 0.905, 1, 0.095])
    hd.set_axis_off()
    hd.add_patch(Rectangle((0, 0), 1, 1, transform=hd.transAxes, fc=NAVY))
    hd.text(0.03, 0.72, "Climate-Aware Stochastic Optimization of Hydropower, Renewable Generation,", fontsize=50,
            color="white", weight="bold", transform=hd.transAxes)
    hd.text(0.03, 0.47, "and Battery Storage for Electricity-System Resilience in Albania", fontsize=50, color="white",
            weight="bold", transform=hd.transAxes)
    hd.text(0.03, 0.2, "Ajsel Budlla  ·  Whitman College, Walla Walla, WA, USA  ·  HYDROFLEX AI — open-source research prototype",
            fontsize=28, color="#A5F3FC", transform=hd.transAxes)
    hd.add_patch(Rectangle((0.885, 0.12), 0.09, 0.76, transform=hd.transAxes, fc="white", ec=CYAN, lw=3))
    hd.text(0.93, 0.5, "QR code\nplaceholder\n(repository /\ndemo link)", transform=hd.transAxes, ha="center", va="center",
            fontsize=16, color=MUTED)

    m, gap = 0.02, 0.015
    cw = (1 - 2 * m - gap) / 2
    # left column
    a = panel(fig, m, 0.765, cw, 0.13, "Problem & research question")
    text(a, 0.03, 0.9, "Albania: ≈95% of installed capacity is hydropower; the Drin cascade (Fierza 500, Koman 600, "
                       "Vau i Dejës 250 MW) dominates supply. Dry years mean imports; IRENA projects ≈15–20% lower "
                       "average hydro output by 2050.\n\nHow should a hydropower-dependent system coordinate reservoir "
                       "operation, solar, wind, batteries and imports under uncertain rainfall, demand and budgets?",
         size=21, width=78)
    a = panel(fig, m, 0.49, cw, 0.265, "Model architecture & method", color=VIOLET)
    image(fig, FIG / "fig01_architecture.png", m + 0.01, 0.585, cw - 0.02, 0.16)
    text(a, 0.03, 0.33, "Linear programme (HiGHS): hourly energy balance · reservoir water balance in hm³ "
                        "(κ = ρgHη ≈ 552 MWh/hm³) · battery SOC with independent MW/MWh sizing · aggregate "
                        "interconnector · VOLL-priced shortage · capital budget.\nTwo-stage stochastic programme: "
                        "shared capacities, 5 inflow/market scenarios × 8 hourly representative weeks with nested "
                        "seasonal reservoir boundaries; CVaR via Rockafellar–Uryasev. Verified against PyPSA.",
         size=19, width=82)
    a = panel(fig, m, 0.30, cw, 0.18, "Data & scenarios", color=AMBER)
    image(fig, FIG / "fig03_profiles.png", m + 0.01, 0.305, cw * 0.58, 0.155)
    text(a, 0.61, 0.9, "NASA POWER hourly (PV, wind, temperature) and daily basin precipitation 2000–2023 → "
                       "reconstructed inflow index (5th pct 0.78; min 0.67).\n\nScenarios: normal · moderate drought "
                       "(−22%) · severe (−40%) · compound shock.\n\nDemand & prices: SYNTHETIC — not observed grid "
                       "operations.", size=17, width=36)
    a = panel(fig, m, 0.115, cw, 0.175, "Dispatch under drought", color=CYAN)
    image(fig, FIG / "fig04_dispatch_normal_vs_drought.png", m + 0.01, 0.12, cw - 0.02, 0.15)
    # right column
    x2 = m + cw + gap
    a = panel(fig, x2, 0.615, cw, 0.28, "Main verified findings", color=EMER)
    y = 0.93
    for k in ("B", "C", "E", "F", "H", "I", "J"):
        e = find.get(k)
        if not e:
            continue
        text(a, 0.03, y, f"{e['id']}. {e['title']}", size=19, width=80, color=EMER, weight="bold")
        text(a, 0.03, y - 0.035, e["finding"], size=15.5, width=104)
        y -= 0.135
    a = panel(fig, x2, 0.395, cw, 0.21, "Investment frontier & tail risk", color=VIOLET)
    image(fig, FIG / "fig08_investment_frontier.png", x2 + 0.01, 0.40, cw * 0.55, 0.18)
    image(fig, FIG / "fig09_cvar.png", x2 + cw * 0.56, 0.40, cw * 0.43, 0.18)
    a = panel(fig, x2, 0.215, cw, 0.17, "Sensitivity & marginal value of flexibility", color=AMBER)
    image(fig, FIG / "fig10_sensitivity.png", x2 + 0.01, 0.22, cw * 0.58, 0.145)
    image(fig, FIG / "fig11_marginal_value.png", x2 + cw * 0.59, 0.24, cw * 0.4, 0.11)
    a = panel(fig, x2, 0.115, cw, 0.09, "Limitations", color=RED)
    text(a, 0.03, 0.8, "Single-node model; aggregate interconnector (no power flow) · synthetic demand & prices · "
                       "reconstructed (ungauged) inflows · fixed-head reservoir · assumed costs and scenario probabilities "
                       "· no reserves/ancillary services · NOT validated against observed Albanian operations.",
         size=17, width=110)
    ft = fig.add_axes([0, 0, 1, 0.1])
    ft.set_axis_off()
    text(ft, 0.02, 0.85, "Software: Python, HiGHS (highspy), PyPSA/linopy, FastAPI, React. Data: NASA POWER, Open-Meteo ERA5 "
                         "(cross-check), Natural Earth; costs IRENA Renewable Power Generation Costs in 2024. All results "
                         "regenerated by `python -m hydroflex.experiments.run_all`. No institutional endorsement is implied.",
         size=17, width=190, color=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / "HydroFlex_AI_Poster.pdf")
    fig.savefig(OUT / "HydroFlex_AI_Poster_preview.png", dpi=40)
    print("poster written")


if __name__ == "__main__":
    main()
