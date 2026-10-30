/**
 * TypeScript mirror of docs/API_CONTRACT.md (authoritative).
 * Every numeric field may be `null` when the backend encountered a non-finite value.
 */

export type Num = number | null;

export type PresetKey = 'normal' | 'moderate_drought' | 'severe_drought' | 'compound_shock';
export type RunKind = 'simulate' | 'investment' | 'stochastic';
export type ExperimentKind = RunKind | 'frontier' | 'marginal' | 'sensitivity' | 'summary' | string;

export interface Health {
  status: string;
  version: string;
  solver: string;
  highspy?: string;
  data_mode: string;
  reference_year: number;
  solver_busy: boolean;
  reference_experiments: number;
}

export interface Equation {
  id: string;
  title: string;
  latex: string;
  description: string;
}

export interface Assumption {
  parameter: string;
  value: number | string | boolean | null;
  description?: string;
  group: string;
}

export interface ModelMetadata {
  name: string;
  title: string;
  version: string;
  formulation: string;
  equations: Equation[];
  assumptions: Assumption[];
  limits: Record<string, number>;
  validation_status: string;
  network: string;
}

export interface ProvenanceRecord {
  dataset_id?: string;
  name: string;
  provider: string;
  source_url: string;
  date_accessed: string;
  geographic_coverage: string;
  time_coverage: string;
  temporal_resolution: string;
  time_standard?: string;
  units: string | Record<string, string>;
  license: string;
  processing: string;
  /** Usually a string; for composite processed datasets the backend returns a per-series map. */
  nature: string | Record<string, string>;
  role?: string;
}

export interface DataSources {
  datasets: ProvenanceRecord[];
  profile_summary: {
    reference_year?: number;
    years?: Record<string, Record<string, number>>;
    [k: string]: unknown;
  };
}

export interface ProfilesResponse {
  data_mode: string;
  timestamps: string[];
  series: {
    pv_cf: Num[];
    wind_cf: Num[];
    demand_mw: Num[];
    import_price_eur_mwh: Num[];
    drin_inflow_hm3_per_h: Num[];
    ror_avail_mw: Num[];
    t2m_tirana_c: Num[];
  };
}

export interface ScenarioSpec {
  key: string;
  label: string;
  drought_severity: number;
  demand_growth: number;
  import_price_multiplier: number;
  import_availability: number;
  probability: number;
  description: string;
}

export interface ScenariosResponse {
  presets: ScenarioSpec[];
  stochastic_set: ScenarioSpec[];
}

/* ---------------- Requests ---------------- */

export interface ScenarioOverrides {
  drought_severity?: number | null;
  demand_growth?: number | null;
  import_price_multiplier?: number | null;
  import_availability?: number | null;
}

export interface SystemOverrides {
  pv_mw?: number | null;
  wind_mw?: number | null;
  battery_power_mw?: number | null;
  battery_energy_mwh?: number | null;
  import_capacity_mw?: number | null;
  voll_eur_mwh?: number | null;
  discount_rate?: number | null;
  battery_cost_multiplier?: number | null;
}

export interface HorizonRequest {
  hours: number;
  start_day: number;
  resolution_h: 1 | 2 | 3 | 6;
}

export interface SimulateRequest {
  scenario: PresetKey;
  scenario_overrides?: ScenarioOverrides;
  system?: SystemOverrides;
  horizon?: HorizonRequest;
  label?: string | null;
}

export interface InvestmentRequest extends SimulateRequest {
  budget_meur: number;
  pv_max_mw?: number;
  wind_max_mw?: number;
  battery_power_max_mw?: number;
  battery_energy_max_mwh?: number;
}

export interface StochasticRequest {
  budget_meur: number;
  risk_alpha: number;
  risk_lambda: number;
  system?: SystemOverrides;
  horizon?: HorizonRequest;
  compare_deterministic?: boolean;
  method?: 'representative_weeks' | 'annual_chronological';
  n_weeks?: 4 | 8;
  boundary_passes?: 1 | 2;
  label?: string | null;
}

/* ---------------- RunPayload ---------------- */

export interface ScenarioMetrics {
  key: string;
  label: string;
  probability: Num;
  demand_mwh: Num;
  served_mwh: Num;
  ens_mwh: Num;
  ens_share: Num;
  lol_hours: Num;
  lolp: Num;
  peak_shortfall_mw: Num;
  imports_mwh: Num;
  exports_mwh: Num;
  net_imports_mwh: Num;
  import_share: Num;
  import_cap_binding_hours: Num;
  pv_mwh: Num;
  wind_mwh: Num;
  ror_mwh: Num;
  hydro_res_mwh: Num;
  pv_curtail_mwh: Num;
  wind_curtail_mwh: Num;
  ror_spill_mwh: Num;
  curtailment_share: Num;
  res_spill_hm3: Num;
  res_inflow_hm3: Num;
  res_release_hm3: Num;
  res_v_start_hm3: Num;
  res_v_end_hm3: Num;
  res_v_min_hm3: Num;
  res_hours_at_min: Num;
  battery_throughput_mwh: Num;
  battery_cycles: Num;
  battery_utilisation: Num;
  battery_losses_mwh: Num;
  simultaneous_ch_dis_mwh: Num;
  renewable_generation_mwh: Num;
  domestic_supply_share: Num;
  renewable_share_of_generation: Num;
  opex_keur: Num;
  import_cost_keur: Num;
  export_revenue_keur: Num;
  unserved_penalty_keur: Num;
  hydro_vom_keur: Num;
  battery_degradation_keur: Num;
  opex_keur_annualised: Num;
  price_mean_eur_mwh: Num;
  price_max_eur_mwh: Num;
  max_balance_residual_mw: Num;
  max_soc_residual_mwh: Num;
  max_water_residual_hm3: Num;
  capex_keur: Num;
  total_cost_keur: Num;
  total_cost_keur_annualised: Num;
  cost_per_mwh_served_eur: Num;
}

export type NumericMetricKey = {
  [K in keyof ScenarioMetrics]: ScenarioMetrics[K] extends Num ? K : never;
}[keyof ScenarioMetrics];

export type ExpectedMetrics = Partial<Record<NumericMetricKey, Num>> & {
  capex_overnight_meur?: Num;
  capex_annualised_keur?: Num;
  [k: string]: Num | undefined;
};

export interface SeriesSet {
  demand: Num[];
  pv: Num[];
  wind: Num[];
  ror: Num[];
  hydro: Num[];
  battery_discharge: Num[];
  battery_charge: Num[];
  imports: Num[];
  exports: Num[];
  unserved: Num[];
  pv_available: Num[];
  wind_available: Num[];
  ror_available: Num[];
  pv_curtailed: Num[];
  wind_curtailed: Num[];
  reservoir_hm3: Num[];
  inflow_hm3_h: Num[];
  release_hm3_h: Num[];
  spill_hm3_h: Num[];
  soc_mwh: Num[];
  price_eur_mwh: Num[];
  import_price: Num[];
}

export interface Timeseries {
  timestamps?: string[];
  scenarios?: Record<string, SeriesSet>;
}

export interface Capacities {
  pv: Num;
  wind: Num;
  bp: Num;
  be: Num;
  imp: Num;
  vmax: Num;
}

export interface Additions {
  pv: Num;
  wind: Num;
  bp: Num;
  be: Num;
}

export interface MarginalValue {
  per_unit_horizon_keur: Num;
  per_unit_annualised_keur: Num;
  reduced_cost_keur: Num;
  reliable?: boolean;
  note?: string;
}

export interface Duals {
  marginal_value_pv?: MarginalValue;
  marginal_value_wind?: MarginalValue;
  marginal_value_bp?: MarginalValue;
  marginal_value_be?: MarginalValue;
  marginal_value_imp?: MarginalValue;
  marginal_value_vmax?: MarginalValue;
  budget_shadow_price?: { keur_per_keur_overnight_horizon: Num; binding: boolean };
  [k: string]: MarginalValue | { keur_per_keur_overnight_horizon: Num; binding: boolean } | undefined;
}

export type Severity = 'ok' | 'info' | 'warning' | 'critical';

export interface Explanation {
  kind: 'reliability' | 'binding' | 'operation' | 'storage' | 'price' | 'investment' | 'marginal' | 'error' | string;
  scenario?: string;
  severity: Severity | string;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface SolverInfo {
  name: string;
  version?: string;
  status: string;
  method?: string;
  solve_seconds?: Num;
  build_seconds?: Num;
  total_seconds?: Num;
  iterations?: { simplex?: Num; ipm?: Num; crossover?: Num };
  n_vars?: Num;
  n_rows?: Num;
  n_nonzeros?: Num;
}

export interface RiskInfo {
  alpha: Num;
  lambda: Num;
  var_keur: Num;
  cvar_keur: Num;
  expected_loss_keur: Num;
  worst_loss_keur: Num;
  var_keur_annualised?: Num;
  cvar_keur_annualised?: Num;
  expected_loss_keur_annualised?: Num;
}

export interface RunHorizon {
  steps: number;
  resolution_h: number;
  hours: number;
  start_utc: string;
  weight_of_year: number;
  boundary?: string;
  /** "annualised" for representative-week stochastic runs (scenario metrics are annual), "horizon" otherwise. */
  metrics_basis?: 'annualised' | 'horizon' | string;
}

export interface StochasticInfo {
  implemented: boolean;
  n_scenarios: number;
  formulation: string;
  method: string;
  week_start_days?: number[];
  boundary_passes?: number | { pass: number; status: string; objective_keur: Num; additions?: Partial<Additions> }[];
}

export interface DeterministicComparison {
  deterministic_plan_additions: Partial<Additions> & Record<string, Num>;
  eev_expected_cost_keur: Num;
  rp_expected_cost_keur: Num;
  vss_keur: Num;
  evpi_keur: Num;
  eev_cvar_keur: Num;
  rp_cvar_keur: Num;
  vss_keur_annualised?: Num;
  evpi_keur_annualised?: Num;
  rp_cvar_keur_annualised?: Num;
  eev_cvar_keur_annualised?: Num;
  rp_objective_keur?: Num;
  eev_objective_keur?: Num;
  rp_expected_cost_keur_annualised?: Num;
  eev_expected_cost_keur_annualised?: Num;
  /** RP − EEV on expected cost alone: the price of risk aversion (may be positive). */
  expected_cost_premium_keur_annualised?: Num;
  cvar_reduction_keur_annualised?: Num;
  deterministic_plan_capacities?: Record<string, Num>;
  eev_scenarios: ScenarioMetrics[];
  wait_and_see_capacities?: Record<string, unknown>;
  notes?: string;
}

export interface RunPayload {
  run_id: string;
  kind: RunKind;
  label: string | null;
  created_utc: string;
  freshly_computed: boolean;
  reference?: boolean;
  input: Record<string, unknown>;
  data_mode: string;
  data_label: string;
  status: string;
  optimal: boolean;
  objective_keur: Num;
  objective_keur_annualised: Num;
  horizon: RunHorizon;
  capacities: Capacities;
  additions: Additions;
  expected: ExpectedMetrics;
  risk?: RiskInfo;
  duals?: Duals;
  scenarios: ScenarioMetrics[];
  timeseries: Timeseries;
  explanations: Explanation[];
  solver: SolverInfo;
  warnings: string[];
  assumptions: Assumption[];
  provenance: string[];
  execution?: Record<string, string | number>;
  stochastic?: StochasticInfo;
  deterministic_comparison?: DeterministicComparison;
}

/* ---------------- Registry / reference artefacts ---------------- */

export interface ExperimentSummary {
  run_id: string;
  kind: ExperimentKind;
  label: string | null;
  created_utc: string;
  status: string;
  objective_keur: Num;
  scenarios: string | null;
  reference: boolean;
}

export interface ExperimentsResponse {
  experiments: ExperimentSummary[];
}

export interface FrontierScenarioMetrics {
  total_cost_keur_annualised: Num;
  ens_mwh: Num;
  imports_mwh: Num;
  net_imports_mwh?: Num;
  curtailment_share?: Num;
  lol_hours?: Num;
  cost_per_mwh_served_eur?: Num;
  [k: string]: Num | undefined;
}

export interface FrontierStrategy {
  id: string;
  name: string;
  description: string;
  family: string;
  additions: Additions;
  capex_overnight_meur: Num;
  capex_annualised_keur: Num;
  by_scenario: Record<string, FrontierScenarioMetrics>;
  expected: FrontierScenarioMetrics;
  /** Non-dominated on expected cost vs expected imports. */
  pareto: boolean;
  pareto_cost_cvar?: boolean;
  pareto_capex_imports?: boolean;
  pareto_cost_ens?: boolean;
  cvar_opex_keur_annualised?: Num;
  /** CVaR(0.9) of total annualised cost across evaluation scenarios. */
  cvar_total_keur_annualised?: Num;
}

export interface FrontierPayload {
  run_id: string;
  kind: 'frontier';
  created_utc: string;
  status: string;
  data_label: string;
  reference?: boolean;
  freshly_computed?: boolean;
  evaluation_scenarios: string[];
  strategies: FrontierStrategy[];
  pareto_front: string[];
  pareto_fronts?: Record<string, string[]>;
  pareto_definitions?: Record<string, string>;
  frontier_axes: { x: string; y: string };
}

export interface MarginalRow {
  resource: string;
  unit: string;
  scenario: string;
  base_capacity: Num;
  delta: Num;
  fd_left_keur_per_unit_yr: Num;
  fd_right_keur_per_unit_yr: Num;
  fd_central_keur_per_unit_yr: Num;
  dual_keur_per_unit_yr: Num;
  dual_reliable: boolean;
  annualised_cost_keur_per_unit_yr: Num;
}

export interface MarginalPayload {
  run_id: string;
  kind: 'marginal';
  created_utc: string;
  data_label?: string;
  reference?: boolean;
  rows: MarginalRow[];
}

export interface TornadoRow {
  parameter: string;
  label: string;
  low_value: Num;
  high_value: Num;
  base_value: Num;
  metric_low: Num;
  metric_high: Num;
  metric_base: Num;
}

export interface DroughtSweepRow {
  severity: number;
  /** Interconnector availability for this sweep branch (several branches may share a severity). */
  import_availability?: number;
  lol_hours?: Num;
  net_imports_mwh?: Num;
  ens_mwh: Num;
  imports_mwh: Num;
  total_cost_keur_annualised: Num;
  hydro_mwh: Num;
  price_mean_eur_mwh: Num;
}

export interface SensitivityPayload {
  run_id: string;
  kind: 'sensitivity';
  created_utc: string;
  data_label?: string;
  reference?: boolean;
  metric: string;
  tornado: TornadoRow[];
  drought_sweep: DroughtSweepRow[];
  heatmap?: { metric: string; x_label: string; y_label: string; x: number[]; y: number[]; z: Num[][] };
  robustness?: { strategies: string[]; scenarios: string[]; regret_keur: Num[][] };
}

export interface SummaryExperiment {
  id: string;
  title: string;
  hypothesis?: string;
  configuration?: string | Record<string, unknown>;
  supported?: boolean | null;
  finding?: string;
  limitations?: string;
  metrics?: Record<string, unknown>;
}

export interface SummaryPayload {
  run_id: string;
  kind: 'summary';
  created_utc: string;
  data_label?: string;
  reference?: boolean;
  experiments: SummaryExperiment[];
}

export interface ChronoCheckRow {
  id: string;
  name: string;
  capex_annualised_keur: Num;
  chrono_expected_total_keur: Num;
  chrono_cvar_total_keur: Num;
  repweek_expected_total_keur: Num;
  repweek_cvar_total_keur: Num;
  chrono_by_scenario_opex_keur?: Record<string, Num>;
  repweek_by_scenario_opex_keur?: Record<string, Num>;
  chrono_expected_imports_mwh?: Num;
  chrono_expected_ens_mwh?: Num;
}

export interface ChronoCheckPayload {
  run_id: string;
  kind: 'validation';
  created_utc: string;
  title?: string;
  data_label?: string;
  reference?: boolean;
  rows: ChronoCheckRow[];
  rank_chronological?: string[];
  rank_representative_weeks?: string[];
  [k: string]: unknown;
}

export interface CrossCheckRow {
  scenario: string;
  hours: Num;
  investment: boolean;
  native_objective_keur: Num;
  pypsa_objective_keur: Num;
  rel_diff: Num;
  reservoir_max_abs_diff_hm3: Num;
  native_seconds: Num;
  pypsa_seconds: Num;
}

export interface CrossCheckPayload {
  run_id: string;
  kind: 'validation';
  created_utc: string;
  title?: string;
  data_label?: string;
  reference?: boolean;
  rows: CrossCheckRow[];
  [k: string]: unknown;
}

export type StoredExperiment = RunPayload | FrontierPayload | MarginalPayload | SensitivityPayload | SummaryPayload | ChronoCheckPayload | CrossCheckPayload;

export const REFERENCE_IDS = {
  normalAnnual: 'ref-A-normal-annual',
  moderateAnnual: 'ref-B-moderate-annual',
  severeAnnual: 'ref-B-severe-annual',
  compoundAnnual: 'ref-F-compound-annual',
  demoWeek: 'ref-demo-week',
  frontier: 'ref-H-frontier',
  stochastic: 'ref-I-stochastic',
  marginal: 'ref-J-marginal',
  sensitivity: 'ref-sensitivity',
  summary: 'ref-summary',
  chronoCheck: 'exp-H-chronological-check',
  crossCheck: 'exp-validation',
} as const;

export function isRunPayload(x: unknown): x is RunPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as { kind?: unknown; scenarios?: unknown };
  return (o.kind === 'simulate' || o.kind === 'investment' || o.kind === 'stochastic') && Array.isArray(o.scenarios);
}
