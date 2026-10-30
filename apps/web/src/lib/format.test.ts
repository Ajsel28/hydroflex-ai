import { describe, expect, it } from 'vitest';
import { cleanLabel, energyParts, fmtDelta, fmtEnergy, fmtMEUR, fmtMEURyr, fmtNum, fmtPct, fmtSeconds, fmtUtc, meurParts, scenarioLabel } from './format';

describe('energy auto-scaling', () => {
  it('scales MWh → GWh → TWh', () => {
    expect(energyParts(512)).toEqual({ value: '512', unit: 'MWh' });
    expect(energyParts(75310.46)).toEqual({ value: '75.3', unit: 'GWh' });
    expect(energyParts(8_012_345)).toEqual({ value: '8.01', unit: 'TWh' });
    expect(fmtEnergy(-21163.5)).toBe('-21.2 GWh');
  });
  it('handles null, NaN and infinity', () => {
    expect(fmtEnergy(null)).toBe('—');
    expect(fmtEnergy(Number.NaN)).toBe('—');
    expect(fmtEnergy(Number.POSITIVE_INFINITY)).toBe('—');
    expect(fmtEnergy(undefined)).toBe('—');
  });
});

describe('money', () => {
  it('converts kEUR to M€', () => {
    expect(meurParts(64000)).toEqual({ value: '64.00', unit: 'M€' });
    expect(fmtMEUR(272796.88)).toBe('272.8 M€');
    expect(fmtMEURyr(-272796.88)).toBe('-272.8 M€/yr');
    expect(fmtMEUR(450)).toBe('0.450 M€');
  });
});

describe('misc formatters', () => {
  it('formats percentages from fractions', () => {
    expect(fmtPct(0.9532)).toBe('95.3 %');
    expect(fmtPct(null)).toBe('—');
  });
  it('never prints negative zero', () => {
    expect(fmtNum(-0, 1)).toBe('0.0');
    expect(fmtNum(-1e-15, 0)).toBe('0');
  });
  it('formats signed deltas', () => {
    expect(fmtDelta(12.34, 1, 'MW')).toBe('+12.3 MW');
    expect(fmtDelta(-3, 0)).toBe('−3');
    expect(fmtDelta(0, 0)).toBe('±0');
  });
  it('formats seconds and UTC timestamps', () => {
    expect(fmtSeconds(0.014)).toBe('0.01 s');
    expect(fmtSeconds(12.3)).toBe('12.3 s');
    expect(fmtSeconds(75)).toBe('1 min 15 s');
    expect(fmtUtc('2026-10-30T06:23:38Z')).toBe('2026-10-30 06:23 UTC');
    expect(fmtUtc('2026-10-30T06:23:38Z', false)).toBe('2026-10-30');
  });
  it('repairs mis-decoded separators in data labels', () => {
    expect(cleanLabel('a Â· b â€” c')).toBe('a · b — c');
    expect(cleanLabel('a � b')).toBe('a · b');
  });
  it('labels scenario keys', () => {
    expect(scenarioLabel('severe_drought')).toBe('Severe drought');
    expect(scenarioLabel('some_new_key')).toBe('Some New Key');
  });
});
