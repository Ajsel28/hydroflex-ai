# HYDROFLEX AI

**Climate-Aware Stochastic Optimization of Hydropower, Renewable Generation, and Battery Storage for
Electricity-System Resilience in Albania**

*An Open-Source Digital Twin for Climate-Resilient Renewable Electricity Planning*

Ajsel Budlla · Whitman College · Biochemistry, Biophysics and Molecular Biology

> **Research prototype.** It is not an operational model and is not endorsed by IRENA, Whitman College or any
> Albanian grid operator or regulator. Demand and price inputs are **SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT
> OBSERVED GRID OPERATIONS**. Inflows are reconstructed from reanalysis precipitation, and PV/wind availability
> is derived from weather data. The model is verified (tests, PyPSA cross-check) but **not validated against
> observed Albanian operations**.

---

## Research question
How should a hydropower-dependent electricity system coordinate reservoir operation, renewable generation,
battery storage and electricity imports under uncertain rainfall, fluctuating demand and financial constraints?

## What is in this repository
| Component | Path | Status |
|---|---|---|
| Optimisation engine (sparse LP → HiGHS): dispatch, reservoir water balance, battery, imports, investment, two-stage stochastic + CVaR | `packages/hydroflex/optimization/` | working, tested |
| Independent PyPSA/linopy implementation (cross-check) | `packages/hydroflex/optimization/pypsa_model.py` | agrees to solver precision |
| Data acquisition + provenance (NASA POWER, Open-Meteo, Natural Earth) | `packages/hydroflex/data/`, `data/provenance/` | 30 raw files retrieved (+ Natural Earth subset) |
| Climate / market scenarios | `packages/hydroflex/climate/scenarios.py` | 4 presets + 5-scenario stochastic set |
| Experiment pipeline A–K (+ sensitivity, resolution, validation) | `packages/hydroflex/experiments/` | executed; outputs in `results/experiments/` |
| FastAPI backend | `apps/api/hydroflex_api/` | working, 13 API tests |
| React/TypeScript digital-twin UI (10 pages incl. presentation mode) | `apps/web/` | builds; 39 unit tests + 3 e2e tests |
| LaTeX manuscript (sources, generated figures/tables) | `research/paper/` | complete source; **PDF not compiled here (no LaTeX engine)** |
| Poster generator (A0 PDF) | `research/poster/` | generated with matplotlib |
| Policy brief (generated from results) | `research/POLICY_BRIEF.md` | generated |
| Two-minute video package | `video/` | script, shot list, storyboard, captions; **no video rendered** |

## Main findings (model implications under stated assumptions)
All numbers come from `results/experiments/` (regenerate with `python -m hydroflex.experiments.run_all`).

1. **Drought is a cost and import risk first.** Inflows −22% / −40% raise net imports from 0.77 to 2.26 / 3.48
   TWh/yr and operating cost from 40.8 to 192.7 / 324.5 MEUR/yr, with no unserved energy while the 900 MW
   interconnector is available.
2. **Interconnector availability governs reliability.** Under severe drought with +8% demand, shortage appears
   at ≤50% import availability (311 GWh/yr). It is energy-limited: a 400 MW / 1,600 MWh battery cuts it by only 13%,
   yet at VOLL 5,000 EUR/MWh that cut is worth 200 MEUR/yr, about 4× the battery's annualised cost.
3. **PV is a no-regret investment while its surplus can be exported.** Its marginal value is ≈140 kEUR/MW-yr
   against an 80 kEUR/MW-yr cost, and the deterministic optimum invests only in PV at every budget from 100 to
   2,000 MEUR. The technology choice is unchanged across a nine-parameter tornado analysis.
4. **Batteries don't pay through arbitrage** (savings 13–27% of annualised cost), and they *increase*
   gross imports. Extra discharge power is worth more than extra energy capacity.
5. **Stochastic planning (VSS) = 0 in the base case**: the risk-neutral and CVaR plans equal the deterministic
   plan. **With exports restricted to 300 MW**, CVaR planning adds wind: −74.5 MEUR/yr tail cost (CVaR₀.₉) for
   +15.1 MEUR/yr expected cost, confirmed with full-year chronology.
6. **Method matters.** 6-hourly steps remove 87% of battery value. Pinned representative-week boundaries
   created spurious scarcity (errors up to 20 MEUR/yr) that reversed a ranking; water-value boundaries reduce the
   error to 1.7–10 MEUR/yr with rankings preserved. Both failures and corrections are logged in
   `AUTONOMOUS_BUILD_LOG.md`.

## Architecture
```
NASA POWER / Open-Meteo / Natural Earth ─► data.fetch ─► data.profiles (PV, wind, inflow reconstruction,
                                                           synthetic demand & prices, provenance JSON)
                                         ─► climate.scenarios ─► optimization.model (sparse LP → HiGHS)
                                                                  ├─ runner (windows, nested & water-value boundaries,
                                                                  │          representative weeks)
                                                                  └─ pypsa_model (independent cross-check)
              analytics (explain, Pareto, regret) ◄─────────────────┘
experiments.run_all ─► results/experiments/*.json ─► figures / tables / summary / policy brief / poster
service ─► FastAPI (apps/api) ─► React UI (apps/web)
```

## Model (summary)
Minimise annualised investment + expected operating cost (imports − exports + VOLL·shortage + hydro O&M +
battery degradation) + λ·CVaR_α, subject to:
- the hourly energy balance;
- PV/wind availability (curtailment implicit);
- reservoir water balance `V(t+1) = V(t) + Δt (I − h/κ − spill)` with `κ = ρgHη ≈ 551.6 MWh/hm³`, bounds, minimum release and terminal conditions;
- battery SOC dynamics `e(t+1) = e(t) + Δt (η_c c − d/η_d)` with independent MW/MWh;
- import/export limits, the capital budget and maximum battery duration.

Full equations: `METHODOLOGY.md`, `docs/equations.json`, paper Section 4.

## Installation
```bash
python -m venv .venv
.venv/Scripts/activate            # Windows  (source .venv/bin/activate on Linux/macOS)
pip install -e ".[dev]"
cd apps/web && npm ci && cd ../..
```

## Run
```bash
# API (http://127.0.0.1:8000/docs)
python -m uvicorn hydroflex_api.main:app --port 8000
# Web UI (http://localhost:5173)
cd apps/web && npm run dev
```

## Data pipeline and experiments
```bash
python -m hydroflex.data.fetch            # download NASA POWER / Open-Meteo (no key needed)
python -m hydroflex.data.profiles         # build processed profiles + provenance
python -m hydroflex.experiments.run_all   # all experiments (≈1 h on 4 cores); --force to recompute, --only H,I2
python research/poster/make_poster.py     # poster
```
Outputs: `results/experiments/*.json` (machine-readable; `manifest.json` records versions and seeds),
`research/paper/figures/*.pdf|png`, `research/paper/tables/*.tex|csv`.

## Tests
```bash
pytest -q                                  # 67 Python tests (physics, conservation, CVaR, duals, PyPSA, API, data)
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

## Paper
`research/paper/main.tex` (sections in `sections/`, bibliography `references.bib`). Compile with
`latexmk -pdf main.tex` or `tectonic main.tex`. No LaTeX engine was available in the build environment, so
the PDF has not been produced yet (see `FINAL_BUILD_REPORT.md`).

## Deployment
The optimiser needs a **persistent Python backend**; it cannot run on static hosting alone.
- API: `Dockerfile.api` (health check `/api/health`), example `deploy/render.yaml`, `deploy/docker-compose.yml`.
- Frontend: static build (`apps/web/dist`), e.g. `deploy/vercel.json`; set `VITE_API_BASE` at build time and
  `HYDROFLEX_CORS_ORIGINS` on the API. Live runs are rate-limited and size-capped (`apps/api/hydroflex_api/main.py`).

## Documentation
`METHODOLOGY.md`, `MODEL_CARD.md`, `DATA_CARD.md`, `LIMITATIONS.md`, `docs/API_CONTRACT.md`, `docs/FRONTEND.md`,
`AUTONOMOUS_BUILD_LOG.md`, `FINAL_BUILD_REPORT.md`, `CHANGELOG.md`.

## Citation
```
Budlla, A. (2026). HYDROFLEX AI: Climate-aware stochastic optimization of hydropower, renewable generation,
and battery storage for electricity-system resilience in Albania (research prototype, v0.1.0).
```

## Licence
Code: MIT. Data: see the per-dataset licences in `data/provenance/` (NASA POWER acknowledgement; Open-Meteo CC BY 4.0;
Natural Earth public domain).
