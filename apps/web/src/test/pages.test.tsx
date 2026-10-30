import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import fixture from './fixtures/sample_simulate_72h.json';
import type { RunPayload } from '../api/types';
import { Providers } from '../App';
import MissionControl from '../pages/MissionControl';
import Dispatch from '../pages/Dispatch';
import { buildSankey } from '../components/charts/RunCharts';
import { palette } from '../lib/colors';

const run = fixture as unknown as RunPayload;

type Call = { data: { name?: string; type?: string; y?: unknown[] }[]; layout: Record<string, unknown> };
const reactCalls: Call[] = vi.hoisted(() => []);

// Fake Plotly: record each Plotly.react call so we can assert on traces without a canvas.
vi.mock('../components/charts/plotlyLoader', () => ({
  loadPlotly: () =>
    Promise.resolve({
      react: (el: HTMLElement, data: Call['data'], layout: Call['layout']) => {
        reactCalls.push({ data, layout });
        return Promise.resolve(Object.assign(el, { on: () => undefined }));
      },
      purge: () => undefined,
      Plots: { resize: () => undefined },
    }),
}));

vi.mock('../api/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../api/client')>();
  const fx = (await import('./fixtures/sample_simulate_72h.json')).default as unknown as RunPayload;
  return {
    ...mod,
    api: {
      ...mod.api,
      health: () => Promise.resolve({ status: 'ok', version: '0.1.0', solver: 'HiGHS', data_mode: 'x', reference_year: 2022, solver_busy: false, reference_experiments: 0 }),
      experiments: () =>
        Promise.resolve({
          experiments: [{ run_id: fx.run_id, kind: 'simulate', label: null, created_utc: fx.created_utc, status: 'Optimal', objective_keur: fx.objective_keur, scenarios: 'normal', reference: false }],
        }),
      experiment: (id: string) => (id === fx.run_id ? Promise.resolve(fx) : Promise.reject(new mod.ApiError('unknown run id', 404))),
    },
  };
});

function renderAt(path: string, el: ReactNode, route: string) {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={el} />
        </Routes>
      </MemoryRouter>
    </Providers>,
  );
}

beforeEach(() => {
  reactCalls.length = 0;
});

describe('Mission Control', () => {
  it('renders KPIs from the payload and labels the run as live', async () => {
    renderAt(`/mission?run=${run.run_id}`, <MissionControl />, '/mission');
    const kpis = await screen.findByTestId('mission-kpis');
    // demand 75 310 MWh → 75.3 GWh (fixture value, not invented)
    expect(kpis).toHaveTextContent('75.3');
    expect(kpis).toHaveTextContent('GWh');
    // annualised objective −272 796.9 kEUR → −272.8 M€/yr
    expect(kpis).toHaveTextContent('-272.8');
    expect(kpis).toHaveTextContent('Optimal');
    expect(screen.getAllByTestId('run-tag')[0]).toHaveTextContent(/^Live run · .* HiGHS Optimal$/);
    expect(screen.getAllByTestId('data-label')[0]).toHaveTextContent('SYNTHETIC RESEARCH DEMONSTRATION DATA');
    await waitFor(() => expect(reactCalls.length).toBeGreaterThanOrEqual(3));
    const dispatch = reactCalls.find((c) => c.data.some((d) => d.name === 'Demand'));
    expect(dispatch).toBeDefined();
    const names = dispatch!.data.map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(['Hydro (reservoir)', 'Run-of-river', 'Solar PV', 'Exports', 'Demand']));
    // exports are drawn below zero
    const exp = dispatch!.data.find((d) => d.name === 'Exports')!;
    expect((exp.y as number[]).every((v) => v <= 0)).toBe(true);
    expect(reactCalls.some((c) => c.data[0]?.type === 'sankey')).toBe(true);
  });

  it('shows a not-yet-generated state for a missing reference experiment', async () => {
    renderAt('/mission', <MissionControl />, '/mission');
    expect(await screen.findByText(/not generated yet/)).toBeInTheDocument();
  });
});

describe('Dispatch Explorer', () => {
  it('renders synchronised dispatch, availability and price charts', async () => {
    renderAt(`/dispatch?run=${run.run_id}`, <Dispatch />, '/dispatch');
    await screen.findByText('Stacked dispatch (exports and battery charging below zero)');
    await waitFor(() => expect(reactCalls.length).toBeGreaterThanOrEqual(4));
    expect(reactCalls.some((c) => c.data.some((d) => d.name === 'System marginal cost (dual)'))).toBe(true);
    expect(reactCalls.some((c) => c.data.some((d) => d.name === 'Available (curtailment shaded)'))).toBe(true);
    expect(screen.getByRole('link', { name: /Timeseries CSV/ })).toHaveAttribute('href', expect.stringContaining(`/api/experiments/${run.run_id}/download?format=csv`));
  });
});

describe('Sankey builder', () => {
  it('uses only payload energies and balances the grid node', () => {
    const m = run.scenarios[0];
    const f = buildSankey(m, run, palette('dark'));
    const grid = f.labels.indexOf('Grid (single node)');
    const inflow = f.value.filter((_, i) => f.target[i] === grid).reduce((a, b) => a + b, 0);
    const outflow = f.value.filter((_, i) => f.source[i] === grid).reduce((a, b) => a + b, 0);
    expect(inflow).toBeCloseTo((m.hydro_res_mwh ?? 0) + (m.ror_mwh ?? 0) + (m.pv_mwh ?? 0) + (m.wind_mwh ?? 0) + (m.imports_mwh ?? 0), 3);
    expect(outflow).toBeCloseTo((m.served_mwh ?? 0) + (m.exports_mwh ?? 0), 3);
    expect(inflow).toBeCloseTo(outflow, 0);
  });
});
