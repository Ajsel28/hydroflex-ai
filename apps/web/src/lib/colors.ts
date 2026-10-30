import type { Theme } from '../state/theme';

/** Semantic technology colours, shared by every chart. Mirrors the CSS tokens in index.css. */
export type Tech =
  | 'hydro'
  | 'ror'
  | 'solar'
  | 'wind'
  | 'battery'
  | 'imports'
  | 'unserved'
  | 'exports'
  | 'charging'
  | 'demand'
  | 'curtailment'
  | 'money'
  | 'uncertainty'
  | 'price'
  | 'accent'
  | 'warn'
  | 'ok';

const DARK: Record<Tech, string> = {
  hydro: '#22D3EE',
  ror: '#0D9488',
  solar: '#FACC15',
  wind: '#34D399',
  battery: '#A78BFA',
  imports: '#708399',
  unserved: '#F87171',
  exports: '#4B5D78',
  charging: '#7C66C9',
  demand: '#E6EDF7',
  curtailment: '#F59E0B',
  money: '#F5B841',
  uncertainty: '#A78BFA',
  price: '#F5B841',
  accent: '#3B82F6',
  warn: '#F87171',
  ok: '#34D399',
};

const LIGHT: Record<Tech, string> = {
  hydro: '#0E7490',
  ror: '#14B8A6',
  solar: '#CA8A04',
  wind: '#059669',
  battery: '#7C3AED',
  imports: '#64748B',
  unserved: '#DC2626',
  exports: '#94A3B8',
  charging: '#A78BFA',
  demand: '#0B1526',
  curtailment: '#D97706',
  money: '#A16207',
  uncertainty: '#6D28D9',
  price: '#A16207',
  accent: '#1D4ED8',
  warn: '#B91C1C',
  ok: '#047857',
};

export function palette(theme: Theme): Record<Tech, string> {
  return theme === 'light' ? LIGHT : DARK;
}

export function techColor(t: Tech, theme: Theme): string {
  return palette(theme)[t];
}

/** Hex → rgba with alpha. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const TECH_LABELS: Record<Tech, string> = {
  hydro: 'Hydro (reservoir)',
  ror: 'Run-of-river',
  solar: 'Solar PV',
  wind: 'Wind',
  battery: 'Battery discharge',
  imports: 'Imports',
  unserved: 'Unserved energy',
  exports: 'Exports',
  charging: 'Battery charging',
  demand: 'Demand',
  curtailment: 'Curtailment',
  money: 'Cost',
  uncertainty: 'Uncertainty',
  price: 'Shadow price',
  accent: 'Accent',
  warn: 'Warning',
  ok: 'OK',
};

/** Scenario colours by identity (never by rank). */
export function scenarioColor(key: string, theme: Theme): string {
  const p = palette(theme);
  const map: Record<string, string> = {
    wet_year: p.accent,
    normal: p.hydro,
    dry_year: p.solar,
    moderate_drought: p.money,
    severe_drought: p.unserved,
    compound_shock: p.battery,
  };
  return map[key] ?? p.imports;
}
