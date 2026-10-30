# Model Card — HYDROFLEX AI optimisation engine (v0.1.0)

## Overview
A linear-programming (LP) model of the Albanian electricity system. It co-optimises hourly dispatch of reservoir
hydro, run-of-river hydro, solar PV, wind, batteries and imports/exports. It can also optimise investment
in PV, wind, battery power and battery energy under a capital budget, deterministically or as a two-stage
stochastic programme with a CVaR risk term. It is solved with HiGHS (open source).

## Intended use
- Research and education: exploring how flexibility resources interact under drought and market stress.
- Conference demonstration of transparent, reproducible energy-system optimisation.

## Out-of-scope use
- Operational dispatch, market bidding, grid-security assessment or any real investment decision.
- Quoting results as forecasts for the Albanian system: demand and prices are synthetic.

## Formulation (summary)
Objective: annualised investment (additions only) + expected operating cost (imports − exports + VOLL·shortage +
hydro O&M + battery degradation proxy) + λ·CVaR_α. Constraints: energy balance; PV/wind availability
(curtailment implicit); reservoir water balance in hm³ with fixed-head energy equivalent κ ≈ 551.6 MWh/hm³;
turbine, minimum-release and terminal conditions; battery SOC dynamics with independent MW and MWh capacities;
aggregate import/export limits; capital budget; maximum battery duration. Full equations: `METHODOLOGY.md`,
`docs/equations.json`, paper Section 4.

## Engines
- **Native** sparse LP (`hydroflex.optimization.model`): primary engine, supports everything.
- **PyPSA/linopy** (`hydroflex.optimization.pypsa_model`): independent deterministic implementation used for
  verification. Objectives agree to ~1e-12 relative on all test cases.

## Verification (not empirical validation)
- Automated tests: conservation (energy, battery, water), bounds, behaviour (zero solar, zero battery, zero
  imports, zero demand, visible shortages, VOLL monotonicity, infeasibility reporting), objective and CVaR
  reconciliation, VSS ≥ 0, and dual-vs-finite-difference subgradient checks.
- Cross-check against PyPSA on five 168–720 h cases (`results/experiments/exp-validation.json`).
- **No comparison against observed Albanian operations has been performed.**

## Inputs
Weather-derived PV/wind (NASA POWER), reconstructed inflows (NASA POWER precipitation + conceptual hydrology),
**synthetic** demand and prices. See `DATA_CARD.md`.

## Key assumptions and sensitivities
VOLL 5,000 EUR/MWh; discount rate 7%; IRENA 2024 costs × 1.25; NTC 900 MW; export price ratio 0.85. Tornado
analysis in `results/experiments/ref-sensitivity.json`.

## Known limitations
See `LIMITATIONS.md`: single node, aggregate interconnector, fixed-head reservoir, no reserves or unit
commitment, representative-week approximation for investment, partly assumed scenario probabilities.

## Author
Ajsel Budlla (Whitman College). Independent research prototype, with no institutional endorsement.
