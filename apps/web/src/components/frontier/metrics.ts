import type { FrontierScenarioMetrics, FrontierStrategy } from '../../api/types';
import type { Tech } from '../../lib/colors';
import { isNum } from '../../lib/format';

/** Strategy family → semantic technology colour (identity, never rank). */
export const FAMILY_TECH: Record<string, Tech> = {
  baseline: 'imports',
  solar: 'solar',
  wind: 'wind',
  battery: 'battery',
  coordinated: 'hydro',
  robust: 'money',
  budget_sweep: 'accent',
};
export const FAMILY_LABEL: Record<string, string> = {
  baseline: 'Baseline',
  solar: 'Solar',
  wind: 'Wind',
  battery: 'Battery',
  coordinated: 'Coordinated portfolio',
  robust: 'Robust',
  budget_sweep: 'Budget sweep',
};
export const familyTech = (f: string): Tech => FAMILY_TECH[f] ?? 'imports';

export type MetricKey = 'total_cost_keur_annualised' | 'cvar_total_keur_annualised' | 'imports_mwh' | 'ens_mwh' | 'net_imports_mwh' | 'lol_hours' | 'curtailment_share' | 'cost_per_mwh_served_eur';

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Converts the raw payload value to the display unit. */
  scale: (v: number) => number;
  unit: string;
  digits: number;
}

export function energyScale(values: (number | null | undefined)[]): { div: number; unit: string } {
  const m = Math.max(0, ...values.filter(isNum).map(Math.abs));
  if (m >= 1e6) return { div: 1e6, unit: 'TWh' };
  if (m >= 1e3) return { div: 1e3, unit: 'GWh' };
  return { div: 1, unit: 'MWh' };
}

export function metricDef(key: MetricKey, sample: (number | null | undefined)[] = []): MetricDef {
  switch (key) {
    case 'total_cost_keur_annualised':
      return { key, label: 'Total annualised cost', scale: (v) => v / 1000, unit: 'M€/yr', digits: 1 };
    case 'cvar_total_keur_annualised':
      return { key, label: 'CVaR₀.₉ of total cost', scale: (v) => v / 1000, unit: 'M€/yr', digits: 1 };
    case 'imports_mwh':
    case 'net_imports_mwh': {
      const s = energyScale(sample);
      return { key, label: key === 'imports_mwh' ? 'Imports' : 'Net imports', scale: (v) => v / s.div, unit: `${s.unit}/yr`, digits: s.unit === 'TWh' ? 3 : s.unit === 'GWh' ? 1 : 0 };
    }
    case 'ens_mwh':
      return { key, label: 'Energy not served', scale: (v) => v, unit: 'MWh/yr', digits: 0 };
    case 'lol_hours':
      return { key, label: 'Loss-of-load hours', scale: (v) => v, unit: 'h/yr', digits: 0 };
    case 'curtailment_share':
      return { key, label: 'Curtailment share', scale: (v) => v * 100, unit: '%', digits: 1 };
    case 'cost_per_mwh_served_eur':
      return { key, label: 'Cost per MWh served', scale: (v) => v, unit: '€/MWh', digits: 1 };
  }
}

/** Metrics for a view; in the expected view the strategy-level CVaR of total cost is merged in. */
export function metricsFor(s: FrontierStrategy, view: string): FrontierScenarioMetrics | undefined {
  if (view !== 'expected') return s.by_scenario?.[view];
  if (!s.expected) return undefined;
  return { ...s.expected, cvar_total_keur_annualised: s.expected.cvar_total_keur_annualised ?? s.cvar_total_keur_annualised ?? null };
}

export function val(m: FrontierScenarioMetrics | undefined, key: MetricKey): number | null {
  const v = m?.[key];
  return isNum(v) ? v : null;
}
