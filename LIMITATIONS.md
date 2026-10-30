# Limitations — what HYDROFLEX AI can and cannot claim

HYDROFLEX AI is a **research prototype**. It is not an operational planning model and is not endorsed by
IRENA, Whitman College, KESH, OST, ERE or any Albanian authority. Its results are conditional on the
assumptions listed here and in `DATA_CARD.md`.

## Data
1. **Demand is synthetic.** Hourly demand is generated from Tirana 2 m temperature (NASA POWER) with assumed
   heating/cooling sensitivities, an assumed diurnal/weekly shape and AR(1) noise, scaled to an assumed 8.0 TWh/yr.
   It is *not* observed Albanian load (ENTSO-E Transparency data require an API token that was not used).
2. **Prices are synthetic.** Import prices are a documented synthetic profile (mean 105 EUR/MWh). Export prices
   are a fixed 85% of import prices. No market-coupling or bidding behaviour is modelled.
3. **Hydrological inflows are reconstructed, not gauged.** A degree-day snow model and two linear reservoirs
   transform basin-mean NASA POWER precipitation into an inflow index, scaled so that the 2001–2023 mean
   matches an *assumed* long-run Drin-cascade energy of 4.1 TWh/yr. Parameters were not calibrated against
   gauge or plant records (none were accessible). The reconstructed year-to-year ranking should not be read
   as the observed hydrology of any particular year.
4. **PV and wind capacity factors are weather-derived**, from coarse reanalysis (MERRA-2 ~0.5°×0.625°,
   CERES 1°). They are not measured production. Coarse reanalysis typically understates site-level wind
   speeds, so wind results are likely conservative.
5. **Existing capacities** for PV (300 MW) and the interconnector NTC (900 MW) are order-of-magnitude
   assumptions, not verified current values.

## Model structure
6. **Single node (copper plate).** No internal transmission constraints, losses, voltage or stability limits.
7. **Aggregate interconnection.** One import and one export limit replace the individual lines to Montenegro,
   Kosovo, North Macedonia and Greece. This is not an AC (or DC) power-flow model.
8. **Reservoir simplification.** The Drin cascade (Fierza, Koman, Vau i Dejës) is one equivalent reservoir with
   a fixed aggregate head of 230 m (linear power–discharge relation). Head variation, travel times between
   stages and individual reservoir limits are not represented. Other hydro (~930 MW) is run-of-river without storage.
9. **No thermal fleet.** The Vlora thermal plant (98 MW) is excluded.
10. **No reserves, ramping, unit commitment or ancillary services.** Battery value is therefore limited to energy
    arbitrage and shortage avoidance — real batteries often earn most revenue from services not modelled here.
11. **Battery simultaneous charge/discharge** is not excluded by binary variables; a throughput cost removes the
    incentive and it is monitored ex post (reported in each run).
12. **Representative weeks.** Investment and stochastic runs use 8 hourly weeks per scenario. Each week starts at the
    volume of a coarse (6-h) annual run with the existing fleet, and its end volume is valued at that run's water value.
    Seasonal water allocation therefore does not adapt to new investment. Against full-year chronology the error is
    1.7-10.0 MEUR/yr in expected cost, with strategy rankings preserved (`exp-H-chronological-check`).

## Uncertainty and economics
13. **Scenario probabilities are partly assumed** (historical bins from reconstructed years plus an assumed 15%
    climate-stress allowance). Five scenarios do not represent the full climate distribution, and drought is a
    uniform inflow scaling of one reference year.
14. **Technology costs** are IRENA global weighted averages (2024) with an assumed 1.25 regional multiplier;
    discount rate, lifetimes and O&M are assumptions. Results are sensitive to them (see the tornado analysis).
15. **VOLL** (5,000 EUR/MWh) is an assumption; sensitivity 2,000–10,000 EUR/MWh is reported.
16. **Dual values are local.** They are subgradients of a piecewise-linear value function; they can be
    non-unique (degenerate) and are meaningless at zero-capacity corners, where finite differences are used.

## Validation status
17. **No empirical validation against observed Albanian grid operations has been performed.** The model was
    verified (i) against an independent PyPSA/linopy formulation on test cases, (ii) by automated
    conservation and behaviour tests. Comparisons between scenarios are model experiments, not empirical
    validation.
18. Findings are **model implications** under stated assumptions, not policy recommendations.
