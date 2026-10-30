/**
 * Climate Stress Lab form model + validation. Ranges mirror docs/API_CONTRACT.md and
 * apps/api/hydroflex_api/schemas.py exactly; the server remains authoritative (422 messages are shown too).
 */
import type {
  HorizonRequest,
  InvestmentRequest,
  PresetKey,
  ScenarioOverrides,
  ScenarioSpec,
  SimulateRequest,
  StochasticRequest,
  SystemOverrides,
} from '../api/types';

export type LabMode = 'simulate' | 'investment' | 'stochastic';

export type FieldKey =
  | 'drought_severity'
  | 'demand_growth'
  | 'import_price_multiplier'
  | 'import_availability'
  | 'pv_mw'
  | 'wind_mw'
  | 'battery_power_mw'
  | 'battery_energy_mwh'
  | 'import_capacity_mw'
  | 'voll_eur_mwh'
  | 'budget_meur'
  | 'risk_lambda'
  | 'risk_alpha'
  | 'hours'
  | 'start_day'
  | 'resolution_h';

export interface FieldSpec {
  key: FieldKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** min is exclusive (value must be > min) */
  minExclusive?: boolean;
  step: number;
  integer?: boolean;
  /** blank = keep the documented model default */
  optional?: boolean;
  help?: string;
}

export const FIELDS: Record<FieldKey, FieldSpec> = {
  drought_severity: { key: 'drought_severity', label: 'Drought severity', unit: 'fraction of inflow removed', min: -0.5, max: 0.9, step: 0.01, help: '0 = reference-year inflows; 0.4 = −40 % inflow; negative = wetter than reference.' },
  demand_growth: { key: 'demand_growth', label: 'Demand growth', unit: 'fraction', min: -0.3, max: 0.6, step: 0.01, help: 'Scales the synthetic demand profile (0.08 = +8 %).' },
  import_price_multiplier: { key: 'import_price_multiplier', label: 'Import price multiplier', unit: '×', min: 0, max: 5, minExclusive: true, step: 0.05, help: 'Multiplies the synthetic import-price profile.' },
  import_availability: { key: 'import_availability', label: 'Interconnector availability', unit: 'fraction of NTC', min: 0, max: 1, step: 0.05, help: 'Share of the interconnection capacity available (1 = fully available).' },
  pv_mw: { key: 'pv_mw', label: 'Solar PV capacity', unit: 'MW', min: 0, max: 10000, step: 10, optional: true },
  wind_mw: { key: 'wind_mw', label: 'Wind capacity', unit: 'MW', min: 0, max: 10000, step: 10, optional: true },
  battery_power_mw: { key: 'battery_power_mw', label: 'Battery power', unit: 'MW', min: 0, max: 5000, step: 10, optional: true },
  battery_energy_mwh: { key: 'battery_energy_mwh', label: 'Battery energy', unit: 'MWh', min: 0, max: 40000, step: 50, optional: true },
  import_capacity_mw: { key: 'import_capacity_mw', label: 'Interconnection capacity', unit: 'MW', min: 0, max: 5000, step: 50, optional: true },
  voll_eur_mwh: { key: 'voll_eur_mwh', label: 'Value of lost load (reliability penalty)', unit: '€/MWh', min: 100, max: 50000, step: 100, optional: true },
  budget_meur: { key: 'budget_meur', label: 'Capital budget', unit: 'M€', min: 0, max: 5000, step: 10 },
  risk_lambda: { key: 'risk_lambda', label: 'Risk aversion λ', unit: 'weight on CVaR', min: 0, max: 20, step: 0.1, help: '0 = risk-neutral (expected cost only).' },
  risk_alpha: { key: 'risk_alpha', label: 'CVaR confidence α', unit: '', min: 0.5, max: 0.99, step: 0.01, help: 'CVaR averages the worst (1 − α) probability tail.' },
  hours: { key: 'hours', label: 'Horizon', unit: 'h', min: 24, max: 8760, step: 24, integer: true },
  start_day: { key: 'start_day', label: 'Start day of year', unit: 'day (0 = 1 Jan)', min: 0, max: 364, step: 1, integer: true },
  resolution_h: { key: 'resolution_h', label: 'Time step', unit: 'h', min: 1, max: 6, step: 1, integer: true },
};

export const SCENARIO_FIELDS: FieldKey[] = ['drought_severity', 'demand_growth', 'import_price_multiplier', 'import_availability'];
export const SYSTEM_FIELDS: FieldKey[] = ['pv_mw', 'wind_mw', 'battery_power_mw', 'battery_energy_mwh', 'import_capacity_mw', 'voll_eur_mwh'];

/** Step limits per mode (from /api/model/metadata `limits`). */
/** Problem-size limits. Defaults match the local API; replaced by the live server's limits from /api/health. */
export const LIMITS: { simulate: number; investment: number; stochastic_total: number } = {
  simulate: 8760,
  investment: 2920,
  stochastic_total: 7300,
};
export function applyServerLimits(l: Partial<typeof LIMITS> | undefined): void {
  if (!l) return;
  for (const k of ['simulate', 'investment', 'stochastic_total'] as const) {
    const v = l[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) LIMITS[k] = v;
  }
}
export const RESOLUTIONS = [1, 2, 3, 6] as const;

/** Form values are kept as strings so the user can type freely; parsed on validation. */
export type StochasticMethod = 'representative_weeks' | 'annual_chronological';
export type LabForm = { mode: LabMode; preset: PresetKey; label: string; method: StochasticMethod; n_weeks: 4 | 8; compare: boolean } & Record<FieldKey, string>;

/** Stochastic request with the newer optional backend fields (method / n_weeks / boundary_passes). */
export type StochasticRequestExt = StochasticRequest & { method?: StochasticMethod; n_weeks?: 4 | 8; boundary_passes?: 1 | 2 };

export function defaultForm(): LabForm {
  return {
    mode: 'simulate',
    preset: 'normal',
    label: '',
    method: 'representative_weeks',
    n_weeks: 4,
    compare: true,
    drought_severity: '',
    demand_growth: '',
    import_price_multiplier: '',
    import_availability: '',
    pv_mw: '',
    wind_mw: '',
    battery_power_mw: '',
    battery_energy_mwh: '',
    import_capacity_mw: '',
    voll_eur_mwh: '',
    budget_meur: '500',
    risk_lambda: '0',
    risk_alpha: '0.9',
    hours: '168',
    start_day: '14',
    resolution_h: '1',
  };
}

/** Fill the four scenario parameters from a preset returned by GET /api/scenarios. */
export function applyPreset(form: LabForm, spec: ScenarioSpec): LabForm {
  return {
    ...form,
    preset: spec.key as PresetKey,
    drought_severity: String(spec.drought_severity),
    demand_growth: String(spec.demand_growth),
    import_price_multiplier: String(spec.import_price_multiplier),
    import_availability: String(spec.import_availability),
  };
}

export function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function validateField(spec: FieldSpec, raw: string): string | null {
  const v = parseNum(raw);
  if (v === null) return spec.optional ? null : `${spec.label} is required`;
  if (Number.isNaN(v)) return 'Enter a number';
  if (spec.integer && !Number.isInteger(v)) return 'Must be a whole number';
  if (spec.minExclusive ? v <= spec.min : v < spec.min) return `Must be ${spec.minExclusive ? '>' : '≥'} ${spec.min}${spec.unit && spec.unit.length < 6 ? ` ${spec.unit}` : ''}`;
  if (v > spec.max) return `Must be ≤ ${spec.max.toLocaleString('en-GB')}${spec.unit && spec.unit.length < 6 ? ` ${spec.unit}` : ''}`;
  return null;
}

export interface Validation {
  errors: Partial<Record<FieldKey, string>>;
  steps: number | null;
  ok: boolean;
}

/** Fields relevant to each mode. */
export function fieldsFor(mode: LabMode, method: StochasticMethod = 'annual_chronological'): FieldKey[] {
  const horizon: FieldKey[] = ['hours', 'start_day', 'resolution_h'];
  const base: FieldKey[] = [...horizon, ...SYSTEM_FIELDS];
  if (mode === 'simulate') return [...SCENARIO_FIELDS, ...base];
  if (mode === 'investment') return [...SCENARIO_FIELDS, ...base, 'budget_meur'];
  return [...(method === 'annual_chronological' ? horizon : []), ...SYSTEM_FIELDS, 'budget_meur', 'risk_lambda', 'risk_alpha'];
}

/** True when the horizon inputs are used by the selected mode. */
export const usesHorizon = (form: Pick<LabForm, 'mode' | 'method'>) => form.mode !== 'stochastic' || form.method === 'annual_chronological';

export function validateForm(form: LabForm, nStochasticScenarios = 5): Validation {
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const k of fieldsFor(form.mode, form.method)) {
    const e = validateField(FIELDS[k], form[k]);
    if (e) errors[k] = e;
  }
  const hours = parseNum(form.hours);
  const res = parseNum(form.resolution_h);
  const day = parseNum(form.start_day);
  if (!errors.resolution_h && res !== null && !(RESOLUTIONS as readonly number[]).includes(res)) errors.resolution_h = 'Time step must be 1, 2, 3 or 6 h';
  let steps: number | null = null;
  if (!usesHorizon(form)) {
    steps = 168 * form.n_weeks;
    if (steps * nStochasticScenarios > LIMITS.stochastic_total) errors.hours = `Too many scenario-steps (${steps} × ${nStochasticScenarios})`;
  } else if (!errors.hours && !errors.resolution_h && hours !== null && res !== null && !Number.isNaN(hours) && !Number.isNaN(res)) {
    if (hours % res !== 0) errors.hours = `Horizon must be a multiple of the ${res} h time step`;
    steps = Math.floor(hours / res);
    if (!errors.start_day && day !== null && !Number.isNaN(day) && day * 24 + hours > 8760) errors.hours = `Start day ${day} + ${hours} h runs past the end of the year (max ${8760 - day * 24} h)`;
    if (form.mode === 'investment' && steps > LIMITS.investment) errors.hours = `Investment runs are limited to ${LIMITS.investment} steps (this is ${steps}); use a coarser time step or shorter horizon`;
    if (form.mode === 'stochastic' && steps * nStochasticScenarios > LIMITS.stochastic_total)
      errors.hours = `Stochastic runs are limited to ${LIMITS.stochastic_total} scenario-steps (${steps} steps × ${nStochasticScenarios} scenarios = ${steps * nStochasticScenarios})`;
  }
  const be = parseNum(form.battery_energy_mwh);
  const bp = parseNum(form.battery_power_mw);
  if (!errors.battery_energy_mwh && be !== null && be > 0 && (bp === null || bp === 0)) errors.battery_power_mw = 'Battery energy > 0 requires battery power > 0';
  return { errors, steps, ok: Object.keys(errors).length === 0 };
}

const opt = (s: string): number | null => {
  const v = parseNum(s);
  return v === null || Number.isNaN(v) ? null : v;
};

export function horizonOf(form: LabForm): HorizonRequest {
  return { hours: Number(form.hours), start_day: Number(form.start_day), resolution_h: Number(form.resolution_h) as HorizonRequest['resolution_h'] };
}

export function systemOf(form: LabForm): SystemOverrides {
  return {
    pv_mw: opt(form.pv_mw),
    wind_mw: opt(form.wind_mw),
    battery_power_mw: opt(form.battery_power_mw),
    battery_energy_mwh: opt(form.battery_energy_mwh),
    import_capacity_mw: opt(form.import_capacity_mw),
    voll_eur_mwh: opt(form.voll_eur_mwh),
  };
}

export function scenarioOverridesOf(form: LabForm): ScenarioOverrides {
  return {
    drought_severity: opt(form.drought_severity),
    demand_growth: opt(form.demand_growth),
    import_price_multiplier: opt(form.import_price_multiplier),
    import_availability: opt(form.import_availability),
  };
}

export type LabRequest =
  | { mode: 'simulate'; body: SimulateRequest }
  | { mode: 'investment'; body: InvestmentRequest }
  | { mode: 'stochastic'; body: StochasticRequestExt };

export function buildRequest(form: LabForm): LabRequest {
  const label = form.label.trim() || null;
  const horizon = horizonOf(form);
  const system = systemOf(form);
  if (form.mode === 'stochastic') {
    return {
      mode: 'stochastic',
      body: {
        budget_meur: Number(form.budget_meur),
        risk_alpha: Number(form.risk_alpha),
        risk_lambda: Number(form.risk_lambda),
        system,
        ...(form.method === 'annual_chronological' ? { horizon } : {}),
        compare_deterministic: form.compare,
        method: form.method,
        n_weeks: form.n_weeks,
        label,
      },
    };
  }
  const sim: SimulateRequest = { scenario: form.preset, scenario_overrides: scenarioOverridesOf(form), system, horizon, label };
  if (form.mode === 'investment') return { mode: 'investment', body: { ...sim, budget_meur: Number(form.budget_meur) } };
  return { mode: 'simulate', body: sim };
}

/** Map a FastAPI 422 `loc` (e.g. ["system","pv_mw"]) to a form field, if any. */
export function fieldForLoc(loc: string[]): FieldKey | null {
  for (let i = loc.length - 1; i >= 0; i--) {
    if (loc[i] in FIELDS) return loc[i] as FieldKey;
  }
  return null;
}
