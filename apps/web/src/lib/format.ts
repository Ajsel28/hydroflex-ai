/** Number formatting helpers. Every function accepts null/undefined/non-finite and returns an em dash. */

export const DASH = '—';

export type Maybe = number | null | undefined;

export function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Normalise negative zero so "-0" never appears in the UI. */
const nz = (x: number) => (Object.is(x, -0) || Math.abs(x) < 1e-12 ? 0 : x);

export function fmtNum(x: Maybe, digits = 1, opts: Intl.NumberFormatOptions = {}): string {
  if (!isNum(x)) return DASH;
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...opts,
  }).format(nz(x));
}

/** Significant-figure aware formatting: large numbers get fewer decimals. */
export function fmtAuto(x: Maybe): string {
  if (!isNum(x)) return DASH;
  const a = Math.abs(x);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : 3;
  return fmtNum(x, d);
}

export interface Parts {
  value: string;
  unit: string;
}

export function energyParts(mwh: Maybe): Parts {
  if (!isNum(mwh)) return { value: DASH, unit: 'MWh' };
  const a = Math.abs(mwh);
  if (a >= 1e6) return { value: fmtNum(mwh / 1e6, a >= 1e7 ? 1 : 2), unit: 'TWh' };
  if (a >= 1e3) return { value: fmtNum(mwh / 1e3, a >= 1e5 ? 0 : 1), unit: 'GWh' };
  return { value: fmtNum(mwh, a >= 100 ? 0 : 1), unit: 'MWh' };
}

export const join = (p: Parts) => (p.value === DASH ? DASH : `${p.value} ${p.unit}`);

export const fmtEnergy = (mwh: Maybe) => join(energyParts(mwh));

/** kEUR → M€ with sensible precision. */
export function meurParts(keur: Maybe): Parts {
  if (!isNum(keur)) return { value: DASH, unit: 'M€' };
  const m = keur / 1000;
  const a = Math.abs(m);
  return { value: fmtNum(m, a >= 100 ? 1 : a >= 1 ? 2 : 3), unit: 'M€' };
}
export const fmtMEUR = (keur: Maybe) => join(meurParts(keur));
export const fmtMEURyr = (keur: Maybe) => (isNum(keur) ? `${meurParts(keur).value} M€/yr` : DASH);
export const fmtKEUR = (keur: Maybe, digits = 0) => (isNum(keur) ? `${fmtNum(keur, digits)} k€` : DASH);

export function fmtPct(frac: Maybe, digits = 1): string {
  if (!isNum(frac)) return DASH;
  return `${fmtNum(frac * 100, digits)} %`;
}

export const fmtMW = (x: Maybe, digits = 0) => (isNum(x) ? `${fmtNum(x, digits)} MW` : DASH);
export const fmtMWh = (x: Maybe, digits = 0) => (isNum(x) ? `${fmtNum(x, digits)} MWh` : DASH);
export const fmtHm3 = (x: Maybe, digits = 0) => (isNum(x) ? `${fmtNum(x, digits)} hm³` : DASH);
export const fmtPrice = (x: Maybe, digits = 1) => (isNum(x) ? `${fmtNum(x, digits)} €/MWh` : DASH);
export const fmtHours = (x: Maybe, digits = 0) => (isNum(x) ? `${fmtNum(x, digits)} h` : DASH);

export function fmtSeconds(s: Maybe): string {
  if (!isNum(s)) return DASH;
  if (s < 1) return `${fmtNum(s, 2)} s`;
  if (s < 60) return `${fmtNum(s, 1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function fmtInt(x: Maybe): string {
  return fmtNum(x, 0);
}

/** Signed delta string, e.g. "+12.3". */
export function fmtDelta(x: Maybe, digits = 1, unit = ''): string {
  if (!isNum(x)) return DASH;
  const v = nz(x);
  const s = v > 0 ? '+' : v < 0 ? '−' : '±';
  return `${s}${fmtNum(Math.abs(v), digits)}${unit ? ` ${unit}` : ''}`;
}

export function fmtUtc(iso: string | null | undefined, withTime = true): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : date;
}

/** The backend label sometimes arrives with mis-decoded separators (e.g. "Â·", "â€”", U+FFFD). Repair for display only. */
export function cleanLabel(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/Ã‚Â·|Â·/g, '·')
    .replace(/â€”|Ã¢â‚¬â€/g, '—')
    .replace(/â€“/g, '–')
    .replace(/ � /g, ' · ')
    .replace(/�/g, '·');
}

export function titleCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SCENARIO_LABELS: Record<string, string> = {
  normal: 'Normal',
  moderate_drought: 'Moderate drought',
  severe_drought: 'Severe drought',
  compound_shock: 'Compound shock',
  wet_year: 'Wet year',
  dry_year: 'Dry year',
};
export const scenarioLabel = (k: string | null | undefined) => (k ? (SCENARIO_LABELS[k] ?? titleCase(k)) : DASH);
