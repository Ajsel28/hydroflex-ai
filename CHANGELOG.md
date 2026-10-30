# Changelog

## 0.1.0 — 2026-10-30 (initial research prototype)
- Native sparse-LP engine (HiGHS): dispatch, reservoir water balance, battery, imports/exports, investment with
  budget, two-stage stochastic programme with grouped CVaR, dual-based marginal values.
- PyPSA/linopy cross-check implementation.
- NASA POWER / Open-Meteo / Natural Earth acquisition with provenance records; PV, wind, inflow-reconstruction and
  synthetic demand/price profiles.
- Representative-week planning with fleet-independent, water-value boundaries, replacing (a) a 6-hourly annual
  formulation that erased storage value and (b) a pinned-boundary variant that created spurious scarcity.
- Experiment pipeline A–K, I2, sensitivity, resolution and validation; generated figures, tables, summary and
  policy brief.
- FastAPI service with registry, downloads, rate and size limits.
- React/TypeScript UI: 10 pages including Presentation Mode.
- LaTeX manuscript sources, A0 poster, two-minute video package.
