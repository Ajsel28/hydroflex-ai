import { describe, expect, it } from 'vitest';
import { applyPreset, buildRequest, defaultForm, FIELDS, fieldForLoc, validateField, validateForm } from './validation';

describe('validateField', () => {
  it('mirrors API ranges', () => {
    expect(validateField(FIELDS.drought_severity, '0.4')).toBeNull();
    expect(validateField(FIELDS.drought_severity, '0.95')).toMatch(/≤ 0.9/);
    expect(validateField(FIELDS.drought_severity, '-0.6')).toMatch(/≥ -0.5/);
    expect(validateField(FIELDS.import_price_multiplier, '0')).toMatch(/>/);
    expect(validateField(FIELDS.voll_eur_mwh, '50')).toMatch(/≥ 100/);
    expect(validateField(FIELDS.pv_mw, '')).toBeNull(); // optional → default
    expect(validateField(FIELDS.budget_meur, '')).toMatch(/required/);
    expect(validateField(FIELDS.hours, '48.5')).toMatch(/whole/);
    expect(validateField(FIELDS.pv_mw, 'abc')).toMatch(/number/);
  });
});

describe('validateForm', () => {
  const preset = { key: 'severe_drought', label: 'Severe drought', drought_severity: 0.4, demand_growth: 0, import_price_multiplier: 1, import_availability: 1, probability: 1, description: '' };

  it('accepts the default dispatch form once a preset fills scenario values', () => {
    const f = applyPreset(defaultForm(), preset);
    const v = validateForm(f);
    expect(v.ok).toBe(true);
    expect(v.steps).toBe(168);
  });

  it('enforces the 2920-step investment limit', () => {
    const f = { ...applyPreset(defaultForm(), preset), mode: 'investment' as const, hours: '8760', start_day: '0', resolution_h: '1' };
    expect(validateForm(f).errors.hours).toMatch(/2920/);
    expect(validateForm({ ...f, resolution_h: '3' }).ok).toBe(true);
  });

  it('enforces the stochastic scenario-step limit', () => {
    const f = { ...defaultForm(), mode: 'stochastic' as const, method: 'annual_chronological' as const, hours: '8760', start_day: '0', resolution_h: '3' };
    expect(validateForm(f, 5).errors.hours).toMatch(/7300/);
    expect(validateForm({ ...f, resolution_h: '6' }, 5).ok).toBe(true);
    // representative weeks ignore the horizon fields: 8 weeks × 168 h × 5 scenarios = 6720 ≤ 7300
    expect(validateForm({ ...f, method: 'representative_weeks', n_weeks: 8 }, 5).ok).toBe(true);
    expect(validateForm({ ...f, method: 'representative_weeks', n_weeks: 8 }, 5).steps).toBe(1344);
  });

  it('rejects horizons past year end and battery energy without power', () => {
    const f = applyPreset(defaultForm(), preset);
    expect(validateForm({ ...f, start_day: '364', hours: '48' }).errors.hours).toMatch(/end of the year/);
    expect(validateForm({ ...f, battery_energy_mwh: '1200', battery_power_mw: '' }).errors.battery_power_mw).toBeTruthy();
    expect(validateForm({ ...f, battery_energy_mwh: '1200', battery_power_mw: '300' }).ok).toBe(true);
  });
});

describe('buildRequest', () => {
  it('builds a simulate body with overrides and null defaults', () => {
    const f = { ...defaultForm(), drought_severity: '0.3', demand_growth: '0', import_price_multiplier: '1', import_availability: '1', pv_mw: '500', hours: '48' };
    const r = buildRequest(f);
    expect(r.mode).toBe('simulate');
    if (r.mode !== 'simulate') return;
    expect(r.body.scenario_overrides?.drought_severity).toBe(0.3);
    expect(r.body.system?.pv_mw).toBe(500);
    expect(r.body.system?.wind_mw).toBeNull();
    expect(r.body.horizon).toEqual({ hours: 48, start_day: 14, resolution_h: 1 });
  });

  it('builds a stochastic body without scenario fields', () => {
    const r = buildRequest({ ...defaultForm(), mode: 'stochastic', risk_lambda: '2', risk_alpha: '0.95' });
    expect(r.mode).toBe('stochastic');
    if (r.mode !== 'stochastic') return;
    expect(r.body.risk_lambda).toBe(2);
    expect(r.body.risk_alpha).toBe(0.95);
    expect('scenario' in r.body).toBe(false);
    expect(r.body.method).toBe('representative_weeks');
    expect(r.body.n_weeks).toBe(4);
    expect(r.body.horizon).toBeUndefined();
  });

  it('maps 422 locations to fields', () => {
    expect(fieldForLoc(['system', 'pv_mw'])).toBe('pv_mw');
    expect(fieldForLoc(['horizon', 'hours'])).toBe('hours');
    expect(fieldForLoc(['unknown'])).toBeNull();
  });
});
