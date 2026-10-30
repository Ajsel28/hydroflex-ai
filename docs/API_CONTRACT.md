# HYDROFLEX AI — API & Data Contract

Base URL (dev): `http://127.0.0.1:8000`. Frontend reads `VITE_API_BASE` (default `http://127.0.0.1:8000`).
All monetary values are **kEUR** unless the key says otherwise (`_meur`, `_eur_mwh`). Energies MWh, powers MW,
volumes hm³. Timestamps are ISO-8601 UTC (`...Z`). Albania local time = `Europe/Tirane`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{status, version, solver, data_mode, reference_year, solver_busy, reference_experiments}` |
| GET | `/api/model/metadata` | `{name, title, version, formulation, equations:[{id,title,latex,description}], assumptions:[{parameter,value,description,group}], limits, validation_status, network}` |
| GET | `/api/data/sources` | `{datasets:[provenance records], profile_summary}` (provenance: name, provider, source_url, date_accessed, geographic_coverage, time_coverage, temporal_resolution, units, license, processing, nature) |
| GET | `/api/data/profiles?start_day=0&days=365&resolution_h=24` | input profiles `{data_mode, timestamps, series:{pv_cf, wind_cf, demand_mw, import_price_eur_mwh, drin_inflow_hm3_per_h, ror_avail_mw, t2m_tirana_c}}` |
| GET | `/api/scenarios` | `{presets:[ScenarioSpec], stochastic_set:[ScenarioSpec]}`; ScenarioSpec = `{key,label,drought_severity,demand_growth,import_price_multiplier,import_availability,probability,description}` |
| POST | `/api/simulate` | dispatch run (fixed fleet) → **RunPayload** |
| POST | `/api/optimize/investments` | capacity expansion under budget → **RunPayload** (`kind:"investment"`) |
| POST | `/api/optimize/stochastic` | two-stage stochastic + CVaR → **RunPayload** (`kind:"stochastic"`) + `stochastic`, `deterministic_comparison` |
| GET | `/api/experiments` | `{experiments:[{run_id,kind,label,created_utc,status,objective_keur,scenarios,reference}]}` |
| GET | `/api/experiments/{id}` | stored payload (reference experiments have `reference:true, freshly_computed:false`) |
| GET | `/api/experiments/{id}/download?format=json|csv|metrics_csv` | file download |
| GET | `/api/paper` | PDF if compiled, otherwise LaTeX source (header `X-HydroFlex-Note`) |

Errors: 422 (validation, body `{detail}` — FastAPI format: `detail` may be a string or a list of `{loc,msg}`),
429 (rate limit), 503 (solver busy). Live runs take ~0.5–5 s (168–720 h) and up to ~60 s for stochastic.

### Request bodies

```jsonc
// POST /api/simulate
{
  "scenario": "normal" | "moderate_drought" | "severe_drought" | "compound_shock",
  "scenario_overrides": {"drought_severity": 0.3, "demand_growth": 0.05, "import_price_multiplier": 1.2, "import_availability": 0.8}, // all optional / null
  "system": {"pv_mw": 300, "wind_mw": 0, "battery_power_mw": 0, "battery_energy_mwh": 0, "import_capacity_mw": 900,
             "voll_eur_mwh": 5000, "discount_rate": 0.07, "battery_cost_multiplier": 1.0},     // all optional / null
  "horizon": {"hours": 168, "start_day": 14, "resolution_h": 1},   // hours 24..8760, resolution 1|2|3|6
  "label": "optional text"
}
// POST /api/optimize/investments  = simulate body + 
{ "budget_meur": 500, "pv_max_mw": 2000, "wind_max_mw": 1000, "battery_power_max_mw": 1000, "battery_energy_max_mwh": 4000 }
// limit: hours/resolution_h <= 2920 (e.g. 720 h hourly, or a year at 3-6 h)
// POST /api/optimize/stochastic
{ "budget_meur": 500, "risk_alpha": 0.9, "risk_lambda": 0.0, "system": {...}, "compare_deterministic": true,
  "method": "representative_weeks" | "annual_chronological", "n_weeks": 4 | 8, "boundary_passes": 1 | 2 }
// representative_weeks: hourly weeks per scenario; metrics in "scenarios" are ANNUALISED (horizon.metrics_basis = "annualised")
```

Validation ranges: drought_severity −0.5…0.9; demand_growth −0.3…0.6; import_price_multiplier 0–5;
import_availability 0–1; capacities ≥ 0 (pv/wind ≤ 10 000 MW, battery ≤ 5 000 MW / 40 000 MWh, import ≤ 5 000 MW);
voll 100–50 000; budget 0–5 000 MEUR; risk_alpha 0.5–0.99; risk_lambda 0–20.

### RunPayload

```jsonc
{
  "run_id": "run-20261029-...", "kind": "simulate|investment|stochastic", "label": null,
  "created_utc": "...Z", "freshly_computed": true, "reference": false /* only on GET of reference runs */,
  "input": {...request...}, "data_mode": "weather-derived+reconstructed+synthetic" | "synthetic",
  "data_label": "…SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS…",   // ALWAYS display
  "status": "Optimal" | "Infeasible" | "Time limit reached" | ..., "optimal": true,
  "objective_keur": 1234.5, "objective_keur_annualised": 64000.0,
  "horizon": {"steps": 168, "resolution_h": 1, "hours": 168, "start_utc": "...", "weight_of_year": 0.0192, "boundary": "nested"},
  "capacities": {"pv": 300, "wind": 0, "bp": 0, "be": 0, "imp": 900, "vmax": 2400},   // bp MW, be MWh, vmax hm3
  "additions": {"pv": 0, "wind": 0, "bp": 0, "be": 0},
  "expected": { /* probability-weighted versions of every numeric scenario metric */ "capex_overnight_meur": 0, "capex_annualised_keur": 0 },
  "risk": {"alpha": 0.95, "lambda": 0, "var_keur": ..., "cvar_keur": ..., "expected_loss_keur": ..., "worst_loss_keur": ...},
  "duals": {"marginal_value_pv": {"per_unit_horizon_keur": .., "per_unit_annualised_keur": .., "reduced_cost_keur": .., "reliable": true, "note": ".."},
            "marginal_value_wind|bp|be|imp|vmax": {...}, "budget_shadow_price": {"keur_per_keur_overnight_horizon": .., "binding": true} /* investment only */},
  "scenarios": [ ScenarioMetrics ],
  "timeseries": {"timestamps": ["...Z", ...],
                 "scenarios": {"<scenario key>": {"demand","pv","wind","ror","hydro","battery_discharge","battery_charge","imports","exports",
                     "unserved","pv_available","wind_available","ror_available","pv_curtailed","wind_curtailed",
                     "reservoir_hm3","inflow_hm3_h","release_hm3_h","spill_hm3_h","soc_mwh","price_eur_mwh","import_price"}}},
                 // every series has length = steps; MW except reservoir (hm3), inflow/release/spill (hm3/h), soc (MWh), prices (EUR/MWh)
                 // stochastic runs may return timeseries = {} (too large) 
  "explanations": [{"kind":"reliability|binding|operation|storage|price|investment|marginal|error","scenario":"normal","severity":"ok|info|warning|critical","title":"..","detail":"..","evidence":{}}],
  "solver": {"name":"HiGHS","version":"1.15.1","status":"Optimal","method":"choose|ipm","solve_seconds":..,"build_seconds":..,"total_seconds":..,
             "iterations":{"simplex":..,"ipm":..,"crossover":..},"n_vars":..,"n_rows":..,"n_nonzeros":..},
  "warnings": ["..."], "assumptions": [{"parameter","value","description","group"}], "provenance": ["dataset ids"],
  "execution": {"seconds":.., "hydroflex":"0.1.0", "python":"3.13.5", "numpy":"..", "pandas":"..", "scipy":"..", "highspy":".."}
}
```

ScenarioMetrics keys: `key, label, probability, demand_mwh, served_mwh, ens_mwh, ens_share, lol_hours, lolp,
peak_shortfall_mw, imports_mwh, exports_mwh, net_imports_mwh, import_share, import_cap_binding_hours, pv_mwh,
wind_mwh, ror_mwh, hydro_res_mwh, pv_curtail_mwh, wind_curtail_mwh, ror_spill_mwh, curtailment_share, res_spill_hm3,
res_inflow_hm3, res_release_hm3, res_v_start_hm3, res_v_end_hm3, res_v_min_hm3, res_hours_at_min,
battery_throughput_mwh, battery_cycles, battery_utilisation, battery_losses_mwh, simultaneous_ch_dis_mwh,
renewable_generation_mwh, domestic_supply_share, renewable_share_of_generation, opex_keur, import_cost_keur,
export_revenue_keur, unserved_penalty_keur, hydro_vom_keur, battery_degradation_keur, opex_keur_annualised,
price_mean_eur_mwh, price_max_eur_mwh, max_balance_residual_mw, max_soc_residual_mwh, max_water_residual_hm3,
capex_keur, total_cost_keur, total_cost_keur_annualised, cost_per_mwh_served_eur`.
Any numeric value can be `null` (non-finite). Stochastic payloads add:

```jsonc
"stochastic": {"implemented": true, "n_scenarios": 5, "formulation": "...", "method": "representative_weeks|annual_chronological"},
"deterministic_comparison": {"deterministic_plan_additions": {...}, "eev_expected_cost_keur": .., "rp_expected_cost_keur": .., "vss_keur": ..,
   "evpi_keur": .., "eev_cvar_keur": .., "rp_cvar_keur": .., "eev_scenarios": [ScenarioMetrics], "wait_and_see_capacities": {...}, "notes": ".."}
```

## Reference experiment artefacts (produced by `python -m hydroflex.experiments.run_all`)

Served through `/api/experiments/{id}`; all have `reference: true`, `freshly_computed: false`, `created_utc`.

| run_id | kind | content |
|---|---|---|
| `ref-A-normal-annual` | simulate | 8760 h hourly, normal, existing fleet (full timeseries) — Mission Control default |
| `ref-B-moderate-annual`, `ref-B-severe-annual`, `ref-F-compound-annual` | simulate | same, other presets |
| `ref-demo-week` | simulate | the verified demo scenario used by Presentation Mode |
| `ref-H-frontier` | frontier | see below |
| `ref-I-stochastic` | stochastic | RunPayload + comparison |
| `ref-J-marginal` | marginal | see below |
| `ref-sensitivity` | sensitivity | see below |
| `ref-summary` | summary | `{experiments:[{id, title, hypothesis, finding, limitations, metrics:{}}]}` |

```jsonc
// kind: "frontier"
{"run_id":"ref-H-frontier","kind":"frontier","created_utc":"..","status":"Optimal","data_label":"..",
 "evaluation_scenarios":["normal","moderate_drought","severe_drought","compound_shock"],
 "strategies":[{"id":"A_baseline","name":"A. Baseline","description":"..","family":"baseline|solar|wind|battery|coordinated|robust|budget_sweep",
     "additions":{"pv":..,"wind":..,"bp":..,"be":..},"capex_overnight_meur":..,"capex_annualised_keur":..,
     "by_scenario":{"normal":{"total_cost_keur_annualised":..,"ens_mwh":..,"imports_mwh":..,"net_imports_mwh":..,"curtailment_share":..,"lol_hours":..,"cost_per_mwh_served_eur":..}, "severe_drought":{..}, ...},
     "expected":{"total_cost_keur_annualised":..,"ens_mwh":..,"imports_mwh":..}, "pareto": true}],
 "pareto_front":["ids on the non-dominated front (min expected cost, min expected imports)"],
 "frontier_axes":{"x":"expected total annualised cost (kEUR/yr)","y":"expected imports (MWh/yr)"}}
// kind: "marginal"
{"run_id":"ref-J-marginal","kind":"marginal","rows":[{"resource":"battery_energy","unit":"MWh","scenario":"severe_drought","base_capacity":..,
   "delta":..,"fd_left_keur_per_unit_yr":..,"fd_right_keur_per_unit_yr":..,"fd_central_keur_per_unit_yr":..,"dual_keur_per_unit_yr":..,
   "dual_reliable":true,"annualised_cost_keur_per_unit_yr":..}]}
// kind: "sensitivity"
{"run_id":"ref-sensitivity","kind":"sensitivity","metric":"total_cost_keur_annualised",
 "tornado":[{"parameter":"import_price_multiplier","label":"Import price ±30%","low_value":..,"high_value":..,"base_value":..,"metric_low":..,"metric_high":..,"metric_base":..}],
 "drought_sweep":[{"severity":0.0,"ens_mwh":..,"imports_mwh":..,"total_cost_keur_annualised":..,"hydro_mwh":..,"price_mean_eur_mwh":..}],
 "heatmap":{"metric":"..","x_label":"drought severity","y_label":"battery energy (MWh)","x":[..],"y":[..],"z":[[..]]},
 "robustness":{"strategies":[ids],"scenarios":[keys],"regret_keur":[[..]]}}
```
