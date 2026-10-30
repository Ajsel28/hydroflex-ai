# HYDROFLEX AI — Web frontend

`apps/web` is the research web app for HYDROFLEX AI. It is built with React 19, TypeScript (strict), Vite 8 and Tailwind CSS 4. It only displays numbers that come from the FastAPI backend described in `docs/API_CONTRACT.md`.

## Run

```bash
cd apps/web
npm install
npm run dev          # http://localhost:5173  (API: VITE_API_BASE, default http://127.0.0.1:8000)
npm run build        # tsc --noEmit + vite build → dist/
npm run preview      # http://127.0.0.1:4173
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (typescript-eslint, react-hooks)
npm test             # vitest (jsdom)
npm run test:e2e     # playwright (builds + previews on :4173; needs the live API for the Lab test)
npm run geo          # regenerate src/components/map/balkans.geo.json from world-atlas (Natural Earth 1:50m)
```

The API's CORS allow-list already includes `localhost`/`127.0.0.1` on ports 5173 and 4173.

## Architecture

```
src/
  api/        types.ts (mirror of API_CONTRACT.md), client.ts (fetch + ApiError + GET cache), hooks.ts (useAsync, useExperiment polls 404s every 30 s, useExperimentList)
  lib/        format.ts (TWh/GWh/MWh auto-scaling, kEUR→M€, %, UTC, label repair), pareto.ts, colors.ts (semantic tech palette), run.ts (provenance tags, metric helpers), validation.ts (Lab ranges)
  state/      theme.tsx (dark/light, localStorage with try/catch), toast.tsx, app.tsx (health polling, solver pill state, runModel(), data label, presentation flag)
  components/
    charts/   Plot.tsx (thin Plotly.react wrapper, lazy-loads plotly.js-dist-min), plotTheme.ts, SyncX.tsx (shared x-range), RunCharts.tsx (dispatch, price, reservoir, availability, battery, hydro flows, Sankey)
    map/      AlbaniaMap.tsx (d3-geo Mercator on Natural Earth outline + scrubber), balkans.geo.json
    layout/   AppShell (collapsible nav, mobile drawer, top bar, skip link), Logo, PageHeader, RunSelector, RunLoader
    ui/       primitives (Panel, Button, Badge, Kpi, Segmented, Select, EmptyState, Skeleton…), feedback (ErrorBoundary, Toaster, Drawer, Callout), run (RunTag, DataLabel, Explanations, DownloadButtons, SolverDiagnostics, DataTable)
    lab/ present/ frontier/ risk/ landing/ storage/ notebook/   page-specific parts
  pages/      Landing, MissionControl, Lab, Dispatch, Storage, Frontier, Risk, Notebook, About, Present, NotFound (all lazy routes)
e2e/smoke.spec.ts
```

- **Charts.** A custom `<Plot>` calls `Plotly.react` in an effect, rebinds events through refs, resizes with a `ResizeObserver`, and purges on unmount. Plotly (4.6 MB) is code-split and only loads with the first chart. Layout defaults: transparent backgrounds, theme-aware ink and grid colours, `hovermode: "x unified"`, a trimmed modebar, and SVG download.
- **Synchronised charts.** Time-series charts inside a `SyncXProvider` share one x-range. Zooming, the range buttons (1d/3d/1w/all) or the range slider on one chart update all of them.
- **Reference vs live.** Every run view shows a `RunTag`:
  - "Reference experiment · computed <created_utc>" when `reference` is true;
  - "Live run · <s> · HiGHS <status>" when `freshly_computed` is true;
  - "Session run · computed …" for stored non-reference runs.

  The data label (`data_label`) is shown on every results page and in the top-bar provenance tooltip.
- **Missing artefacts.** If a reference artefact is not there yet, the page shows a "not generated yet" state and checks again every 30 s. It fills in automatically once the artefact appears.
- **Map.** The outline is Natural Earth 1:50m: Albania plus Montenegro, Kosovo (matched by name, since it has no id), North Macedonia, Greece, Serbia, Italy and others, drawn faintly.
  - Plant markers sit at the approximate coordinates from the brief and are labelled illustrative.
  - Line widths follow √MW of the run's hourly aggregate dispatch at the scrubbed hour.
  - Interconnection is one aggregate net value, drawn identically on all four corridors and labelled "single-node model; not allocated by border".

## Design tokens

CSS variables live on `[data-theme]` in `src/index.css` and are exposed to Tailwind through `@theme inline`. Chart colours mirror them in `src/lib/colors.ts`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` / `--panel` | #060B14 / #0B1220 | #F4F6FA / #FFFFFF | surfaces |
| `--hydro` | #22D3EE | #0E7490 | reservoir hydro, energy flows, focus |
| `--ror` | #0D9488 | #0F9D8F | run-of-river |
| `--solar` | #FACC15 | #B7791F | solar PV |
| `--wind` / `--renew` | #34D399 | #059669 / #047857 | wind, renewables |
| `--battery` / `--uncertainty` | #A78BFA | #7C3AED / #6D28D9 | battery, stochastic/advanced analysis |
| `--imports` | #708399 | #64748B | imports (exports and charging are drawn below zero) |
| `--money` | #F5B841 | #A16207 | costs, prices |
| `--warn` / `--unserved` | #F87171 | #B91C1C / #DC2626 | reliability warnings, unserved energy |

- **Fonts:** Manrope for the UI, JetBrains Mono for numbers and units (`.num` uses tabular figures), and Newsreader serif for scientific headings.
- **Accessibility:** motion respects `prefers-reduced-motion`. The palette was checked with the dataviz validator; the remaining close pairs (hydro/run-of-river, imports/battery) are always shown with legends, hover labels and CSV export.

## Pages

| Route | Content |
|---|---|
| `/` | Hero, research question, schematic flow visual, key facts from `ref-A-normal-annual` / `ref-summary` (otherwise "pending"), calls to action, page directory |
| `/mission` | KPIs, synchronised dispatch and reservoir charts, Albania map with hour scrubber, energy Sankey, scientific interpretation. Run selector covers reference and live runs (`?run=`) |
| `/lab` | Presets with editable overrides, system and economic controls, horizon, three modes (simulate / investments ≤ 2920 steps / stochastic with method, weeks, λ, α and optional deterministic comparison). Inline validation, server 422 errors mapped to fields, elapsed timer, cancel (AbortController), results, session history, comparison matrix |
| `/dispatch` | Stacked dispatch, solar/wind availability vs dispatch (curtailment shaded), shadow price, day picker and window, metrics, JSON/CSV downloads |
| `/storage` | Reservoir water balance and bounds, battery operation, drought vs normal comparison, short- vs long-duration explainer computed from the payload |
| `/frontier` | `ref-H-frontier` scatter (axes and per-scenario view), payload Pareto flags, client-side Pareto set for other axes, detail drawer, compare-two mode, strategy × scenario heatmap, `ref-J-marginal` panel |
| `/risk` | `ref-I-stochastic` probabilities, cost distribution with VaR/CVaR, VSS/EVPI, plan comparison, EEV table; `ref-sensitivity` tornado, drought sweep, heatmap, regret; failure cases; deterministic vs stochastic explainer |
| `/notebook` | KaTeX equations, formulation, validation status and limits, searchable assumptions, provenance cards, input profiles, experiment registry with downloads, solver diagnostics, paper and repository paths |
| `/about` | Motivation, Albania context, methodology, contributions, what the model can and cannot claim, bio, references, no-endorsement statement |
| `/present` | 7-step walkthrough. Steps 3–5 make real `POST /api/simulate` calls; if the API is down they offer clearly labelled reference runs. Arrow keys, N for notes, F for fullscreen |

## Test results (2026-10-30)

- `npm run typecheck`: passes
- `npm run lint`: passes
- `npm test`: 5 files, 39 tests passed
  - formatters
  - API client error handling (422 / 404 / network / abort / non-JSON)
  - Pareto dominance
  - Lab validation
  - Mission Control and Dispatch component tests rendered from `src/test/fixtures/sample_simulate_72h.json`, with Plotly mocked
  - Sankey energy balance
- `npm run build`: passes (Plotly chunk ≈ 4.6 MB / 1.4 MB gzip, lazy-loaded)
- `npm run test:e2e` (Chromium 1248): 3 passed
  - landing plus every page renders with no page errors
  - sidebar navigation
  - a real 48 h simulation in the Lab against the live API shows "Optimal"

## Known limitations

- The reference experiments (`ref-*`) did not exist while this was built. Frontier, Risk, the drought comparison on Storage, the Landing key facts and the Mission Control default all show their "not generated yet" states. Those views were written against the contract types, and checked only with live runs and the fixture.
- The backend's `data_label` arrives with mis-decoded separators (U+FFFD or `Â·`). `cleanLabel()` repairs it for display only; the backend should fix it at source.
- Each Presentation walkthrough sends up to 4 POSTs. The API rate limit is 12 runs per 10 minutes per IP.
- The Frontier capex drawer shows MW additions and total capex. The payload has no per-technology capex breakdown, so none is shown.
