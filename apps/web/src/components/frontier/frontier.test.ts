import { describe, expect, it } from 'vitest';
import type { FrontierStrategy } from '../../api/types';
import { metricsFor, val } from './metrics';
import { spearman } from './ValidationPanels';

describe('spearman', () => {
  it('is 1 for identical and -1 for reversed rankings', () => {
    expect(spearman(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toBe(1);
    expect(spearman(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a'])).toBe(-1);
  });
  it('uses only ids present in both lists and needs two of them', () => {
    expect(spearman(['a', 'x', 'b'], ['b', 'a', 'y'])).toBe(-1);
    expect(spearman(['a'], ['a'])).toBeNull();
  });
});

describe('metricsFor', () => {
  const s = {
    id: 's',
    expected: { total_cost_keur_annualised: 100, ens_mwh: 0, imports_mwh: 5 },
    by_scenario: { normal: { total_cost_keur_annualised: 90, ens_mwh: 0, imports_mwh: 4 } },
    cvar_total_keur_annualised: 250,
  } as unknown as FrontierStrategy;
  it('merges the strategy-level CVaR into the expected view only', () => {
    expect(val(metricsFor(s, 'expected'), 'cvar_total_keur_annualised')).toBe(250);
    expect(val(metricsFor(s, 'normal'), 'cvar_total_keur_annualised')).toBeNull();
    expect(val(metricsFor(s, 'normal'), 'total_cost_keur_annualised')).toBe(90);
  });
});
