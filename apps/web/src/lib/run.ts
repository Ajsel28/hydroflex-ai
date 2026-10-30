import type { RunPayload, ScenarioMetrics, SeriesSet } from '../api/types';
import { fmtSeconds, fmtUtc } from './format';

type ProvInput = Pick<RunPayload, 'created_utc' | 'status'> &
  Partial<Pick<RunPayload, 'reference' | 'freshly_computed' | 'solver' | 'execution'>>;

/** "Reference experiment · computed …" or "Live run · 1.2 s · HiGHS Optimal". Never presents stored data as fresh. */
export function runProvenance(run: ProvInput): { kind: 'reference' | 'live' | 'stored'; text: string } {
  const solverName = run.solver?.name ?? 'HiGHS';
  const status = run.solver?.status ?? run.status;
  if (run.reference) return { kind: 'reference', text: `Reference experiment · computed ${fmtUtc(run.created_utc)}` };
  const exec = run.execution?.seconds;
  const secs = run.solver?.total_seconds ?? (typeof exec === 'number' ? exec : null);
  if (run.freshly_computed) return { kind: 'live', text: `Live run · ${fmtSeconds(secs)} · ${solverName} ${status}` };
  return { kind: 'stored', text: `Session run · computed ${fmtUtc(run.created_utc)} · ${solverName} ${status}` };
}

/** Headline metrics: the single scenario of a deterministic run, otherwise the probability-weighted expectation. */
export function primaryMetrics(run: RunPayload): Partial<ScenarioMetrics> {
  if (run.scenarios.length === 1) return run.scenarios[0];
  return run.expected as Partial<ScenarioMetrics>;
}

export function scenarioKeys(run: RunPayload): string[] {
  return Object.keys(run.timeseries?.scenarios ?? {});
}

export function seriesFor(
  run: RunPayload,
  key?: string | null,
): { key: string; series: SeriesSet; timestamps: string[] } | null {
  const sc = run.timeseries?.scenarios;
  const ts = run.timeseries?.timestamps;
  if (!sc || !ts || ts.length === 0) return null;
  const k = key && sc[key] ? key : Object.keys(sc)[0];
  if (!k) return null;
  return { key: k, series: sc[k], timestamps: ts };
}

export function assumptionValue(run: { assumptions?: { parameter: string; value: unknown }[] }, param: string): number | null {
  const a = run.assumptions?.find((x) => x.parameter === param);
  return typeof a?.value === 'number' ? a.value : null;
}

/** Annualised system cost (kEUR/yr): objective_keur_annualised, falling back to total_cost_keur_annualised. */
export function annualCostKeur(run: RunPayload): number | null {
  const m = primaryMetrics(run);
  return run.objective_keur_annualised ?? m.total_cost_keur_annualised ?? null;
}

export const sum = (xs: readonly (number | null | undefined)[]) =>
  xs.reduce<number>((a, b) => a + (typeof b === 'number' && Number.isFinite(b) ? b : 0), 0);

export const neg = (xs: readonly (number | null)[]) => xs.map((v) => (typeof v === 'number' ? -v : null));

export const maxOf = (xs: readonly (number | null | undefined)[]) =>
  xs.reduce<number | null>((a, b) => (typeof b === 'number' && Number.isFinite(b) && (a === null || b > a) ? b : a), null);

export const minOf = (xs: readonly (number | null | undefined)[]) =>
  xs.reduce<number | null>((a, b) => (typeof b === 'number' && Number.isFinite(b) && (a === null || b < a) ? b : a), null);
