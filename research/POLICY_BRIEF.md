# HYDROFLEX AI — Research policy brief (model implications, not recommendations)

> **Status:** research prototype; not validated against observed Albanian grid operations. SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS for demand and prices; inflows reconstructed from reanalysis precipitation; PV/wind weather-derived.
> Every statement below is generated from executed model runs (`results/experiments/ref-summary.json`).

## Drought is a cost and import risk first

Net imports rise from 0.77 TWh (normal) to 2.26 (moderate) and 3.48 TWh (severe); operating cost rises from 40.8 to 192.7 and 324.5 MEUR/yr. ENS: 0 and 0 MWh.

*Experiment B — Hydropower reduction under drought (hypothesis supported). Caveat: Drought modelled as a uniform inflow scaling of one reconstructed year.*

## Interconnection availability governs reliability

Annual cost rises from 324 to 968 MEUR/yr as import prices triple, with ENS 0 MWh. Unserved energy appears at NTC availability ≤ 50% (310.7 GWh).

*Experiment F — Import price shock and interconnector derating (hypothesis supported). Caveat: Import availability is an exogenous scenario parameter, not a regional market model.*

## Demand growth under constrained imports

ENS (MWh) at +0/10/20/30% demand: NTC 100%: 0, 0, 0, 0; NTC 50%: 0, 455643, 1201086, 1969392.

*Experiment G — Demand growth stress test (hypothesis supported). Caveat: No demand response or emergency imports are modelled.*

## Solar displaces imports with diminishing returns

Gross import reduction per added MW: normal +500 MW: 1074 MWh/MW, +1000 MW: 898 MWh/MW, +1500 MW: 699 MWh/MW; severe +500 MW: 1406 MWh/MW, +1000 MW: 1253 MWh/MW, +1500 MW: 1022 MWh/MW. PV curtailment at +1500 MW: normal 21 GWh, severe 2 GWh.

*Experiment C — Solar without batteries (hypothesis supported). Caveat: Export capacity and the export price ratio determine how much midday PV surplus is absorbed; both are assumptions.*

## Batteries: arbitrage alone does not pay

Annual operating saving (MEUR/yr) normal: 800 MWh: 5.5, 1600 MWh: 9.8, 3200 MWh: 13.8; severe: 800 MWh: 7.0, 1600 MWh: 12.7, 3200 MWh: 17.9. Annualised cost (MEUR/yr): 800 MWh: 25.8, 1600 MWh: 51.7, 3200 MWh: 103.3.

*Experiment D — Batteries without new renewables (hypothesis supported). Caveat: No ancillary-service, reserve or capacity revenues are modelled; these are often the main value streams of batteries.*

## Coordination adds a small synergy

normal: PV-only saving 135.4, battery-only 9.8, combined 146.9 MEUR/yr (synergy +1.75); severe_drought: PV-only saving 141.7, battery-only 12.7, combined 156.1 MEUR/yr (synergy +1.82)

*Experiment E — Coordinated solar, wind, hydro and storage (hypothesis supported). Caveat: Synergy depends on the export price ratio and NTC, both assumed.*

## Budget-constrained investment

Optimal additions by budget: 0 MEUR → PV 0, wind 0 MW, battery 0 MW/0 MWh; 100 MEUR → PV 126, wind 0 MW, battery 0 MW/0 MWh; 250 MEUR → PV 315, wind 0 MW, battery 0 MW/0 MWh; 500 MEUR → PV 629, wind 0 MW, battery 0 MW/0 MWh; 750 MEUR → PV 944, wind 0 MW, battery 0 MW/0 MWh; 1000 MEUR → PV 1258, wind 0 MW, battery 0 MW/0 MWh; 1500 MEUR → PV 1888, wind 0 MW, battery 0 MW/0 MWh; 2000 MEUR → PV 2000, wind 0 MW, battery 0 MW/0 MWh.

*Experiment H — Investment planning under capital constraints (descriptive). Caveat: Results depend on the cost assumptions and on representative-week sampling.*

## Planning under uncertainty

Risk-adjusted VSS = 0.0 MEUR/yr. The stochastic plan costs +0.0 MEUR/yr in expected cost (price of risk aversion) and lowers CVaR(0.9) of operating cost from 397.3 to 397.3 MEUR/yr. Stochastic additions: pv 629, wind 0, bp 0, be 0; deterministic (normal-year) additions: pv 629, wind 0, bp 0, be 0.

*Experiment I — Deterministic versus stochastic planning (hypothesis not supported). Caveat: Scenario probabilities are partly assumed; five scenarios cannot represent the full distribution of climate outcomes.*

## Marginal value of flexibility

Severe drought, kEUR per unit-year (Δ+ / dual / Δ−): battery_energy: 3.1 / 3.3 / 4.1; battery_power: 15.5 / 18.6 / 20.3; solar_pv: 145.6 / 145.8 / 146.1; wind: 99.2 / 99.3 / n/a; import_capacity: 7.5 / 9.3 / 11.2; reservoir_volume: 0.0 / 0.0 / 0.0.

*Experiment J — Marginal value of flexibility (hypothesis supported). Caveat: Local values around one fleet; not valid for large capacity changes.*

## How reliable is the planning approximation?

Absolute difference in expected total cost: 1.7–10.0 MEUR/yr. Ranking (chronological): S_budget_1500, F_robust, R_l0.0_b500, B_solar, A_baseline, C_wind, D_battery; (representative weeks): S_budget_1500, B_solar, F_robust, R_l0.0_b500, A_baseline, C_wind, D_battery.

*Experiment K — Representative weeks vs full-year chronology (hypothesis supported). Caveat: Chronological runs use V_T = V_0 per scenario year; the representative-week model uses boundaries from the existing fleet.*

## What this does not show

- No transmission, reserve, or unit-commitment constraints are modelled.
- Costs, VOLL, scenario probabilities and the export-price ratio are assumptions; see the tornado analysis.
- Results are conditional on synthetic demand and prices and must be re-run with observed data before any policy use.
