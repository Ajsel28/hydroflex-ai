"""Timed captions (SRT) for the HydroFlex AI demo, matching the on-screen narration in scenes.html.

Numbers are read from video/build/scene_numbers.json (produced from the experiment files).
    python video/src/make_captions.py  ->  video/HydroFlex_AI_Demo_Captions.srt
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
N = json.loads((ROOT / "video" / "build" / "scene_numbers.json").read_text(encoding="utf-8"))
w = N["week"]
a = N["annual"]
i2 = N["i2"]
v = N["validation"]

CUES = [
    (0.4, 4.4, "HYDROFLEX AI — climate intelligence for resilient energy systems."),
    (4.6, 7.4, "About 95% of Albania's installed capacity is hydropower; the Drin cascade alone is 1,350 MW."),
    (7.6, 11.6, "When rainfall fails, the grid must import. How should it plan for an uncertain climate?"),
    (12.4, 19.6, "One hourly optimisation coordinates reservoir hydro, run-of-river, solar, wind, batteries and imports."),
    (20.0, 29.6, "Energy balance, reservoir water balance and battery state of charge — a linear programme solved with "
                 "HiGHS and verified against an independent PyPSA model."),
    (30.4, 37.8, "Mission Control: one full simulated year, hour by hour (reference experiment)."),
    (38.4, 49.8, "Climate Stress Laboratory: a real optimisation of a winter week, solved live by HiGHS."),
    (50.2, 54.8, f"Normal week: imports about {w['normal']['imports_gwh']:.1f} GWh; the surplus is exported."),
    (55.4, 66.8, f"Severe drought, inflows −40%: imports rise to about {w['severe_drought']['imports_gwh']:.1f} GWh; "
                 "no energy goes unserved."),
    (67.2, 74.6, f"Over a full year, net imports rise from {a['normal']['net_imports_twh']:.2f} to "
                 f"{a['severe']['net_imports_twh']:.2f} TWh and operating cost from {a['normal']['opex_meur']:.0f} to "
                 f"{a['severe']['opex_meur']:.0f} M€. Shortages appear only when import availability falls to about half."),
    (75.4, 80.8, f"A 300 MW battery cuts that week's cost from {w['severe_drought']['cost_meur']:.2f} to "
                 f"{w['severe_drought_battery_300mw_1200mwh']['cost_meur']:.2f} M€ — while imports rise: storage shifts "
                 "cheap imports to expensive hours."),
    (81.4, 88.8, "Investment frontier: strategies evaluated on five inflow and market scenarios (reference experiment)."),
    (89.4, 96.6, f"Marginal value: one more MW of solar is worth about {N['marginal']['pv_value']:.0f} k€ per year against "
                 f"an {N['marginal']['pv_cost']:.0f} k€ annualised cost; battery arbitrage recovers only a fraction of its cost."),
    (97.3, 100.8, "Risk and uncertainty: deterministic versus two-stage stochastic planning."),
    (101.4, 108.6, f"With exports limited to 300 MW, risk-aware planning adds {i2['wind_added']:.0f} MW of wind and cuts "
                   f"CVaR from {i2['cvar_det']:.0f} to {i2['cvar_stoch']:.0f} M€/yr — checked against full-year chronology "
                   f"(error {v['chrono_err_min']:.1f}–{v['chrono_err_max']:.1f} M€/yr)."),
    (109.3, 115.6, "HYDROFLEX AI — Ajsel Budlla, Whitman College. Research prototype: synthetic demand and prices; "
                   "not validated against observed grid operations."),
]


def ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"


def main() -> None:
    lines = []
    for i, (t0, t1, text) in enumerate(CUES, 1):
        lines += [str(i), f"{ts(t0)} --> {ts(t1)}", text, ""]
    out = ROOT / "video" / "HydroFlex_AI_Demo_Captions.srt"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("captions:", out, len(CUES), "cues")


if __name__ == "__main__":
    main()
