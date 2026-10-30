# HYDROFLEX AI — Two-minute conference video script (≤ 120 s)

Narrator: Ajsel Budlla. Pace about 150 words per minute (≈ 290 words). Every number comes from executed runs
(`video/DEMO_SCENARIO.json`, `results/experiments/`). The software runs live on camera.
**No video has been rendered yet** — this is the recording script.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | Landing page → Albania map (Mission Control) | "Almost all of Albania's electricity comes from hydropower. The Drin cascade alone — Fierza, Koman and Vau i Dejës — is 1,350 megawatts. When rainfall fails, the grid has to import, and climate projections point to less water." |
| 0:15–0:30 | Mission Control KPIs, provenance badge | "HydroFlex AI is an open-source digital twin I built to study this. It optimises reservoirs, solar, wind, batteries and imports together, hour by hour, using open data and the open-source HiGHS solver. Demand and price data are synthetic — and labelled that way." |
| 0:30–0:55 | Stress Laboratory: preset *Normal*, 168 h from 15 January → RUN OPTIMIZATION; solver pill turns Optimal | "Here is a real optimisation of a winter week. The solver returns an optimal hourly schedule in under a second. In a normal week the reservoir covers demand: Albania imports only about two gigawatt-hours and exports a surplus." |
| 0:55–1:15 | Switch to *Severe drought* → RUN; dispatch and imports update | "Now I cut inflows by forty percent. Every megawatt-hour is still served — but imports jump to about twenty-nine gigawatt-hours and the week's net cost rises by roughly five million euros. Here drought is a financial and import-dependence risk, as long as the interconnectors stay available." |
| 1:15–1:35 | Add battery 300 MW / 1,200 MWh → RUN; Storage page SOC chart | "Adding a 300-megawatt battery lowers that week's cost by about a third of a million euros — while imports actually rise. The battery stores cheap imported energy for expensive hours: flexibility is about timing, not only volume." |
| 1:35–1:50 | Investment Frontier → Risk page (reference experiments, labelled) | "For investment, the model compares portfolios across five inflow and market scenarios. A two-stage stochastic plan with a CVaR risk measure chooses a different mix than a plan built for an average year — and I quantify that difference rather than assume it." |
| 1:50–2:00 | About page / limitations card | "This is a research prototype, not an operational model. Next: observed load and gauge data, network constraints and multi-stage hydro scheduling — toward flexibility planning that holds up in a changing climate." |

Before recording, update the 1:35–1:50 line with the VSS / CVaR values from experiment I in
`results/experiments/ref-summary.json` if you want to quote numbers there.

Arithmetic check (from `DEMO_SCENARIO.json`): severe − normal weekly cost = 1,399.7 − (−3,778.9) = 5,178.6 kEUR ≈ 5.2 M€;
battery saving = 1,399.7 − 1,048.6 = 351.1 kEUR ≈ 0.35 M€.
