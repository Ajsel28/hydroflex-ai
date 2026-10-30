# HYDROFLEX AI — Final Build & Verification Report

Date: 2026-10-30. Environment: Windows 11, 4 CPUs, Python 3.13.5 (`.venv`), Node 24.14.1.
Repository: a dedicated git repo in `hydroflex-ai/` (branch `main`). Nothing has been pushed.

## 1. What was implemented
- **Optimisation engine** (`packages/hydroflex/optimization/`). A vectorised sparse LP → HiGHS covering:
  - hourly energy balance;
  - reservoir water balance in hm³ with κ = ρgHη, bounds, minimum release and terminal or water-value boundaries;
  - run-of-river;
  - PV/wind with implicit curtailment;
  - battery SOC with independent MW/MWh sizing;
  - capacity-limited imports and exports;
  - VOLL shortage;
  - investment with capital budget and duration limit;
  - two-stage stochastic programme with Rockafellar–Uryasev CVaR (grouped for representative weeks);
  - dual-based marginal values with corner flags.
- **PyPSA cross-check** (`pypsa_model.py`).
- **Data** (`packages/hydroflex/data/`): NASA POWER hourly (5 points × 2019–2023) and daily (4 basin points ×
  2000–2023), Open-Meteo ERA5 (cross-check) and Natural Earth. Processing builds PV/wind capacity factors, a
  reconstructed inflow index (snow + linear reservoirs), synthetic demand and synthetic prices. A synthetic
  fallback exists, and every dataset has a provenance JSON record.
- **Scenarios**: 4 presets anchored on the reconstructed inflow distribution, plus a 5-scenario stochastic set.
- **Experiments** A–K, I2 and I3 (I2 chronological check), sensitivity (tornado, drought sweep, battery × drought
  heatmap, regret), resolution study, PyPSA validation. Also a rule-based explanation engine, the Pareto analysis,
  and generators for the policy brief, figures, tables and summary.
- **API** (FastAPI): health, metadata, sources, profiles, scenarios, simulate, investments, stochastic,
  experiment registry (SQLite + JSON) with JSON/CSV downloads, and paper. Size limits, rate limits and a
  single-solver semaphore protect it.
- **Frontend** (`apps/web`, React 19, TS strict, Vite, Tailwind 4, Plotly, KaTeX, Natural Earth map): Landing,
  Mission Control, Climate Stress Lab, Dispatch Explorer, Reservoir & Storage, Investment Frontier, Risk &
  Uncertainty, Research Notebook, About and Presentation Mode. It labels reference and live runs and always
  displays the synthetic-data label.
- **Research outputs**:
  - manuscript sources (`research/paper/`, about 8,500 words, 12 figures, 20 tables, 34 references);
  - A0 poster PDF (`research/poster/HydroFlex_AI_Poster.pdf`);
  - `research/EXECUTIVE_SUMMARY.md` and `research/POLICY_BRIEF.md`;
  - the video package (`video/`).
- **Documentation**: README, MODEL_CARD, DATA_CARD, METHODOLOGY, LIMITATIONS, CHANGELOG, docs/API_CONTRACT.md,
  docs/FRONTEND.md, AUTONOMOUS_BUILD_LOG.md.
- **Deployment configs**: `Dockerfile.api`, `deploy/render.yaml`, `deploy/vercel.json` (static frontend only),
  `deploy/docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`.

## 2. What runs successfully (verified in this session)
| Check | Result |
|---|---|
| `pytest` (physics, conservation, behaviour, infeasibility, budget, CVaR/grouped CVaR, water value, VSS ≥ 0, dual ⊂ finite-difference interval, PyPSA cross-check, API, data/provenance) | **67 passed** |
| `ruff check` | clean |
| Frontend `typecheck`, `lint` | clean |
| Frontend unit tests (vitest) | **42 passed** (6 files) |
| Frontend production build | success (Plotly chunk 4.65 MB, loaded lazily) |
| Playwright e2e (run by the frontend agent before the final contract changes) | 3 passed; **not re-run after the final changes** (the API server was stopped by the system because memory was low) |
| Full experiment pipeline | all stages executed; every solve status Optimal; balance residual < 1e-4 MW, water residual < 1e-6 hm³ |
| PyPSA vs native objectives (5 cases, 168–720 h) | relative difference 0.0 (solver precision) |

## 3. What could not be completed
- **Paper PDF.** No LaTeX engine is installed. Downloading the portable Tectonic binary was blocked by the
  environment's permission policy. The sources pass a static integrity check: all inputs, references, citations
  and figures resolve. To produce `research/paper/HydroFlex_AI_Research_Paper.pdf`, install MiKTeX/TeX Live or
  Tectonic and run `latexmk -pdf main.tex` (or `tectonic main.tex`) in `research/paper`, then rename the output.
- **UI screenshots for the README.** The frontend agent hit a session rate limit while capturing them. Use
  `apps/web/scripts/screenshots.mjs` with the API and the dev server running.
- **Video.** Not rendered. Only the script, shot list, storyboard, captions, demo scenario and checklist exist.
- **Deployment.** Not performed (requires accounts and credentials).
- **Empirical validation** against observed Albanian operations: not possible with accessible data and not claimed.
- ENTSO-E data not used (requires an API token), so demand and prices are synthetic.

## 4. Dataset sources
NASA POWER (hourly & daily point API), Open-Meteo archive (ERA5), Natural Earth 1:50m v5.1.2. Facts used in the
text come from KESH (Drin cascade), IRENA RRA Albania 2021 (via the Exit News summary) and IRENA RPGC 2024.
Details: `DATA_CARD.md`, `data/provenance/`.

## 5. Solver status
HiGHS 1.15.1 via highspy.
- Annual hourly dispatch: about 105k variables, 9–20 s.
- Representative-week stochastic programme (5 × 8 weeks): about 81k variables, 14–27 s, dual simplex (IPM stalls
  on the dense first-stage columns).
- Annual hourly investment: 136 s simplex. 3-hourly: 11 s IPM.

## 6. Numerical results (see `results/experiments/ref-summary.json`, paper Section 7)
- **A:** normal year: 8.00 TWh served, ENS 0, imports 2.00 / exports 1.23 TWh, operating cost 40.8 MEUR.
- **B:** inflow −22% / −40% → net imports 2.26 / 3.48 TWh, operating cost 192.7 / 324.5 MEUR/yr, ENS 0.
- **F/G:** shortage only at ≤50% import availability (311 GWh at 50% availability with +8% demand). A battery
  reduces it by 13%, which is worth 200 MEUR/yr at VOLL.
- **C/D/E:** PV shows diminishing but positive returns. Batteries save 13–27% of their annualised cost and
  increase gross imports. PV+battery synergy is +1.8 MEUR/yr.
- **H:** deterministic optimum = PV only at every budget.
- **I:** VSS = 0 in the base case (stochastic = deterministic plan).
- **I2:** with exports limited to 300 MW, the CVaR plan adds 230 MW of wind and lowers CVaR₀.₉ by 74.5 MEUR/yr for
  +15.1 MEUR/yr of expected cost (full chronology).
- **J:** marginal values; all duals lie within their finite-difference intervals. Import capacity is worth
  175 kEUR/MW-yr under compound shock.
- **K:** representative weeks vs chronology: error 1.7–10.0 MEUR/yr, rankings preserved.
- **R:** 6-hourly steps remove 87% of battery value.

**Methodological corrections made during the build** (details in `AUTONOMOUS_BUILD_LOG.md`):
1. The 2-pass boundary scheme was inconsistent and VSS was computed on expected cost only. Replaced by
   fleet-independent boundaries and risk-adjusted VSS.
2. Pinned week boundaries created spurious scarcity (errors up to 20.4 MEUR/yr, reversed ranking). Replaced by
   water-value boundaries.

Superseded artefacts are retained in `results/superseded/`.

## 7–11. Status summary
- Tests: see §2.
- Paper: complete sources; PDF pending a LaTeX engine.
- Poster: PDF generated (matplotlib); the QR code is a placeholder.
- Video: package complete, not recorded.
- Deployment: configs ready, not deployed.

## 12. Commands
```bash
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m hydroflex.experiments.run_all          # experiments + figures + tables + summary + brief
.venv/Scripts/python research/poster/make_poster.py
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m uvicorn hydroflex_api.main:app --port 8000
cd apps/web && npm ci && npm run dev                            # UI at http://localhost:5173
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
cd research/paper && latexmk -pdf main.tex                      # needs a LaTeX installation
```

## 13. Actions requiring your authorisation or manual intervention
1. Install a LaTeX engine (e.g. `winget install MiKTeX.MiKTeX`, or allow the Tectonic download) and compile the paper.
2. Start the API and UI and capture screenshots (`apps/web/scripts/screenshots.mjs`); re-run `npm run test:e2e`.
3. Record the video following `video/RECORDING_INSTRUCTIONS.md`.
4. Create a GitHub repository and push (not done without authorisation); then replace the QR placeholder and the
   "repository link to be added" text.
5. Deploy the API to a persistent Python host and the frontend to static hosting (accounts required).
6. Optional: register for an ENTSO-E token and replace the synthetic demand and prices.
7. Review the About page wording (the frontend agent names KESH/OST as examples of operators that have *not*
   endorsed the work).
8. The repo lives in OneDrive; `apps/web/node_modules` is large, so consider excluding it from sync.
