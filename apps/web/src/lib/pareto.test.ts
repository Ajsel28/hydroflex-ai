import { describe, expect, it } from 'vitest';
import { dominates, paretoFront, paretoIndices } from './pareto';

const pts = (xs: (number | null | undefined)[][]) => xs.map((objectives, i) => ({ item: `p${i}`, objectives }));

describe('dominates', () => {
  it('requires <= everywhere and < somewhere', () => {
    expect(dominates([1, 1], [2, 2])).toBe(true);
    expect(dominates([1, 2], [2, 2])).toBe(true);
    expect(dominates([2, 2], [2, 2])).toBe(false); // equal points do not dominate each other
    expect(dominates([1, 3], [2, 2])).toBe(false); // trade-off
  });
  it('rejects mismatched dimensions', () => {
    expect(() => dominates([1], [1, 2])).toThrow();
  });
});

describe('paretoIndices', () => {
  it('finds the classic 2-D front', () => {
    // cost, imports
    const p = pts([
      [10, 100], // front
      [20, 50], // front
      [30, 10], // front
      [25, 60], // dominated by [20,50]
      [40, 10], // dominated by [30,10] (tie on y, worse on x)
    ]);
    expect(paretoIndices(p)).toEqual([0, 1, 2]);
  });

  it('keeps exact duplicates on the front (neither dominates the other)', () => {
    const p = pts([
      [5, 5],
      [5, 5],
      [6, 6],
    ]);
    expect(paretoIndices(p)).toEqual([0, 1]);
  });

  it('handles ties on one objective', () => {
    const p = pts([
      [1, 5],
      [1, 3],
      [2, 3],
    ]);
    expect(paretoIndices(p)).toEqual([1]);
  });

  it('excludes points with null / undefined / non-finite objectives and never lets them dominate', () => {
    const p = pts([
      [null, 0],
      [3, 3],
      [undefined, 1],
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [4, 2],
    ]);
    expect(paretoIndices(p)).toEqual([1, 5]);
  });

  it('works in three objectives', () => {
    const p = pts([
      [1, 2, 3],
      [2, 1, 3],
      [3, 3, 1],
      [2, 2, 3], // dominated by [1,2,3]
      [3, 3, 3], // dominated by everything above
    ]);
    expect(paretoIndices(p)).toEqual([0, 1, 2]);
  });

  it('returns an empty front for empty input', () => {
    expect(paretoIndices([])).toEqual([]);
  });
});

describe('paretoFront', () => {
  it('sorts the front by the first objective', () => {
    const p = pts([
      [30, 10],
      [10, 100],
      [20, 50],
      [50, 50],
    ]);
    expect(paretoFront(p).map((x) => x.item)).toEqual(['p1', 'p2', 'p0']);
  });
});
