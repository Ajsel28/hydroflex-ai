/**
 * Pareto (non-dominated) set for minimisation on two or more objectives.
 * Point a dominates b iff a is <= b on every objective and strictly < on at least one.
 * Points with any non-finite objective are excluded (never on the front).
 */
export function dominates(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) throw new Error('objective vectors must have equal length');
  let strictly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) strictly = true;
  }
  return strictly;
}

export interface ParetoInput<T> {
  item: T;
  objectives: (number | null | undefined)[];
}

const finiteAll = (xs: (number | null | undefined)[]): xs is number[] =>
  xs.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Returns the indices of non-dominated points (input order preserved). */
export function paretoIndices<T>(points: readonly ParetoInput<T>[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const oi = points[i].objectives;
    if (!finiteAll(oi)) continue;
    let dominated = false;
    for (let j = 0; j < points.length && !dominated; j++) {
      const oj = points[j].objectives;
      if (i === j || !finiteAll(oj)) continue;
      if (dominates(oj, oi)) dominated = true;
    }
    if (!dominated) out.push(i);
  }
  return out;
}

/** Front sorted by the first objective, convenient for drawing the connecting line. */
export function paretoFront<T>(points: readonly ParetoInput<T>[]): ParetoInput<T>[] {
  return paretoIndices(points)
    .map((i) => points[i])
    .sort((a, b) => (a.objectives[0] as number) - (b.objectives[0] as number));
}
