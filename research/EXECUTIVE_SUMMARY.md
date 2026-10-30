# HYDROFLEX AI — Executive research summary (for conference reviewers)

**Title:** Climate-Aware Stochastic Optimization of Hydropower, Renewable Generation, and Battery Storage for
Electricity-System Resilience in Albania. **Author:** Ajsel Budlla, Whitman College (independent research
prototype; not peer reviewed; no institutional endorsement).

**Problem.** About 95% of Albania's installed capacity is hydropower (IRENA RRA 2021), and the Drin cascade
alone is 1,350 MW (KESH). In dry years, electricity supply shortfalls have to be made up through imports.

**Method.** An open linear programme solved with HiGHS:
- hourly energy balance;
- reservoir water balance in hm³ (κ ≈ 552 MWh/hm³);
- battery power and energy sized independently;
- a capacity-limited aggregate interconnector;
- VOLL-priced shortage and a capital budget.

The planning layer is a two-stage stochastic programme with CVaR (Rockafellar–Uryasev). It runs over 5
inflow/market scenarios × 8 hourly representative weeks, with water-value seasonal boundaries, and it is
validated against full-year chronology (error 1.7–10 MEUR/yr, rankings preserved). An independent PyPSA
formulation reproduces the objectives to solver precision. 67 automated Python tests cover conservation,
behaviour, CVaR and the subgradient property of the duals.

**Data.** NASA POWER irradiance, temperature and wind (2019–2023, hourly) and basin precipitation (2000–2023,
daily), converted into weather-derived capacity factors and a reconstructed inflow index. **Demand and prices are
synthetic.** No observed grid data were used for validation.

**Verified model findings** (under stated assumptions):
1. A 40% inflow reduction causes no shortage, but it raises net imports from 0.8 to 3.5 TWh/yr and operating
   cost by 284 MEUR/yr.
2. Shortage requires ≤50% import availability. It is energy-limited, and batteries reduce it only partly,
   but at VOLL that partial reduction exceeds the battery's cost.
3. PV is a no-regret investment while exports are possible: marginal value ≈140 kEUR/MW-yr against an
   80 kEUR/MW-yr cost. As a result, VSS = 0 in the base case.
4. With exports restricted to 300 MW, CVaR planning adds wind. It lowers CVaR₀.₉ by 74.5 MEUR/yr for
   +15.1 MEUR/yr of expected cost (full chronology).
5. Batteries do not pay through arbitrage alone (13–27% of annualised cost recovered), and they increase
   gross imports.
6. Model design matters: 6-hourly steps remove 87% of battery value, and pinned representative-week
   boundaries created spurious scarcity.

**Contribution.** A transparent, reproducible digital twin (Python engine, FastAPI, React UI) that couples
climate-scenario construction, physical reservoir modelling and risk-aware investment, with every number
traceable to an executed run. The work includes a documented account of two methodological errors that it
detected and corrected itself.

**Limitations.** Single node; aggregate interconnection; synthetic demand and prices; uncalibrated hydrology;
fixed-head reservoir; assumed costs and scenario probabilities; no reserves or unit commitment.
