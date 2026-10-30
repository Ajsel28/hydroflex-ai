import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import type { RunPayload, ScenarioMetrics, SeriesSet } from '../../api/types';
import { alpha, palette, TECH_LABELS, type Tech } from '../../lib/colors';
import { neg, seriesFor, sum } from '../../lib/run';
import { useTheme } from '../../state/theme';
import { EmptyState } from '../ui/primitives';
import { Plot } from './Plot';
import { RANGE_BUTTONS, toPlotTime } from './plotTheme';
import { useSyncX } from './SyncX';

export interface SeriesChartProps {
  run: RunPayload;
  scenario?: string | null;
  height?: number;
  rangeSlider?: boolean;
  /** Draw a vertical cursor at this timestamp index (e.g. map scrubber). */
  cursorIndex?: number | null;
}

function useSeries(run: RunPayload, scenario?: string | null) {
  return useMemo(() => {
    const s = seriesFor(run, scenario);
    if (!s) return null;
    return { ...s, x: s.timestamps.map(toPlotTime) };
  }, [run, scenario]);
}

function NoSeries() {
  return (
    <EmptyState title="No timeseries in this payload">
      Stochastic runs may omit hourly timeseries (too large to transfer). Scenario-level metrics remain available.
    </EmptyState>
  );
}

function xaxisWithSync(range: [string, string] | null, extra: Partial<Layout['xaxis']> = {}): Partial<Layout['xaxis']> {
  return {
    type: 'date',
    title: { text: 'UTC' },
    ...(range ? { range, autorange: false } : { autorange: true }),
    ...extra,
  } as Partial<Layout['xaxis']>;
}

function cursorShape(x: string | undefined, color: string): Partial<Layout>['shapes'] {
  if (!x) return [];
  return [{ type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color, width: 1.5, dash: 'dot' } }];
}

const area = (name: string, x: string[], y: (number | null)[], color: string, group: string, unit = 'MW'): Data => ({
  type: 'scatter',
  mode: 'lines',
  name,
  x,
  y,
  stackgroup: group,
  line: { width: 0.6, color, shape: 'hv' },
  fillcolor: alpha(color, 0.72),
  hovertemplate: `%{y:,.0f} ${unit}<extra>${name}</extra>`,
});

/** Stacked generation with demand line; exports and battery charging below zero. */
export function DispatchChart({ run, scenario, height = 380, rangeSlider = true, cursorIndex }: SeriesChartProps) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const data = useMemo<Data[]>(() => {
    if (!s) return [];
    const S = s.series;
    const has = (arr: (number | null)[]) => arr.some((v) => (v ?? 0) > 1e-6);
    const pos: [Tech, keyof SeriesSet][] = [
      ['hydro', 'hydro'],
      ['ror', 'ror'],
      ['solar', 'pv'],
      ['wind', 'wind'],
      ['battery', 'battery_discharge'],
      ['imports', 'imports'],
      ['unserved', 'unserved'],
    ];
    const traces: Data[] = pos.filter(([, k]) => has(S[k])).map(([t, k]) => area(TECH_LABELS[t], s.x, S[k], p[t], 'pos'));
    if (has(S.exports)) traces.push(area(TECH_LABELS.exports, s.x, neg(S.exports), p.exports, 'neg'));
    if (has(S.battery_charge)) traces.push(area(TECH_LABELS.charging, s.x, neg(S.battery_charge), p.charging, 'neg'));
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: 'Demand',
      x: s.x,
      y: S.demand,
      line: { color: p.demand, width: 1.6, shape: 'hv' },
      hovertemplate: '%{y:,.0f} MW<extra>Demand</extra>',
    });
    return traces;
  }, [s, p]);
  const layout = useMemo<Partial<Layout>>(
    () => ({
      xaxis: xaxisWithSync(sync.range, {
        rangeselector: { ...RANGE_BUTTONS, x: 1, xanchor: 'right', y: 1.02, yanchor: 'bottom', bgcolor: 'rgba(0,0,0,0)', activecolor: alpha(p.hydro, 0.25), font: { size: 10 } },
        ...(rangeSlider ? { rangeslider: { visible: true, thickness: 0.07, bgcolor: 'rgba(0,0,0,0)', bordercolor: alpha(p.imports, 0.4) } } : {}),
      } as Partial<Layout['xaxis']>),
      yaxis: { title: { text: 'Power (MW)' }, tickformat: ',.0f', zeroline: true },
      legend: { y: 1.12, traceorder: 'normal' },
      margin: { t: 56 },
      shapes: cursorShape(cursorIndex != null && s ? s.x[cursorIndex] : undefined, p.money),
    }),
    [sync.range, p, rangeSlider, cursorIndex, s],
  );
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel="Stacked hourly dispatch by technology with demand line; exports and battery charging shown below zero" filename={`${run.run_id}-dispatch`} />;
}

/** Shadow price of the energy balance and the import price. */
export function PriceChart({ run, scenario, height = 220, cursorIndex }: SeriesChartProps) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const data = useMemo<Data[]>(
    () =>
      s
        ? [
            { type: 'scatter', mode: 'lines', name: 'System marginal cost (dual)', x: s.x, y: s.series.price_eur_mwh, line: { color: p.money, width: 1.5, shape: 'hv' }, hovertemplate: '%{y:,.1f} €/MWh<extra>Shadow price</extra>' },
            { type: 'scatter', mode: 'lines', name: 'Import price (synthetic)', x: s.x, y: s.series.import_price, line: { color: p.imports, width: 1.2, dash: 'dot' }, hovertemplate: '%{y:,.1f} €/MWh<extra>Import price</extra>' },
          ]
        : [],
    [s, p],
  );
  const layout = useMemo<Partial<Layout>>(
    () => ({ xaxis: xaxisWithSync(sync.range), yaxis: { title: { text: '€/MWh' }, tickformat: ',.0f' }, shapes: cursorShape(cursorIndex != null && s ? s.x[cursorIndex] : undefined, p.money) }),
    [sync.range, cursorIndex, s, p],
  );
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel="Hourly system marginal cost and import price" filename={`${run.run_id}-price`} />;
}

/** Reservoir storage trajectory with minimum and maximum volume bounds. */
export function ReservoirChart({ run, scenario, height = 240, vmin, vmax, cursorIndex, compare }: SeriesChartProps & { vmin: number | null; vmax: number | null; compare?: { run: RunPayload; label: string }[] }) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const data = useMemo<Data[]>(() => {
    if (!s) return [];
    const out: Data[] = [
      { type: 'scatter', mode: 'lines', name: compare?.length ? `Storage · ${run.scenarios[0]?.label ?? ''}` : 'Reservoir storage', x: s.x, y: s.series.reservoir_hm3, line: { color: p.hydro, width: 2 }, fill: compare?.length ? 'none' : 'tozeroy', fillcolor: alpha(p.hydro, 0.08), hovertemplate: '%{y:,.0f} hm³<extra>Storage</extra>' },
    ];
    const colors = [p.unserved, p.money, p.battery];
    compare?.forEach((c, i) => {
      const cs = seriesFor(c.run);
      if (cs) out.push({ type: 'scatter', mode: 'lines', name: `Storage · ${c.label}`, x: cs.timestamps.map(toPlotTime), y: cs.series.reservoir_hm3, line: { color: colors[i % colors.length], width: 1.6 }, hovertemplate: `%{y:,.0f} hm³<extra>${c.label}</extra>` });
    });
    return out;
  }, [s, p, compare, run]);
  const layout = useMemo<Partial<Layout>>(() => {
    const shapes: NonNullable<Partial<Layout>['shapes']> = [];
    const ann: NonNullable<Partial<Layout>['annotations']> = [];
    if (vmax != null) {
      shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: vmax, y1: vmax, line: { color: p.imports, width: 1, dash: 'dash' } });
      ann.push({ xref: 'paper', x: 0, y: vmax, text: `V<sub>max</sub> ${vmax.toLocaleString('en-GB')} hm³`, showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { size: 10, color: p.imports } });
    }
    if (vmin != null) {
      shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: vmin, y1: vmin, line: { color: p.unserved, width: 1, dash: 'dash' } });
      ann.push({ xref: 'paper', x: 0, y: vmin, text: `V<sub>min</sub> ${vmin.toLocaleString('en-GB')} hm³`, showarrow: false, xanchor: 'left', yanchor: 'top', font: { size: 10, color: p.unserved } });
    }
    const cur = cursorShape(cursorIndex != null && s ? s.x[cursorIndex] : undefined, p.money);
    return {
      xaxis: xaxisWithSync(sync.range),
      yaxis: { title: { text: 'Volume (hm³)' }, tickformat: ',.0f', rangemode: 'tozero' },
      shapes: [...shapes, ...(cur ?? [])],
      annotations: ann,
    };
  }, [vmin, vmax, p, sync.range, cursorIndex, s]);
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel="Reservoir storage volume over time with minimum and maximum bounds" filename={`${run.run_id}-reservoir`} />;
}

/** Availability vs dispatch for one variable renewable; the gap (curtailment) is shaded. */
export function AvailabilityChart({ run, scenario, height = 220, tech }: SeriesChartProps & { tech: 'solar' | 'wind' }) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const avail = tech === 'solar' ? 'pv_available' : 'wind_available';
  const disp = tech === 'solar' ? 'pv' : 'wind';
  const data = useMemo<Data[]>(
    () =>
      s
        ? [
            { type: 'scatter', mode: 'lines', name: 'Dispatched', x: s.x, y: s.series[disp], line: { color: p[tech], width: 1.4 }, fill: 'tozeroy', fillcolor: alpha(p[tech], 0.35), hovertemplate: '%{y:,.0f} MW<extra>Dispatched</extra>' },
            { type: 'scatter', mode: 'lines', name: 'Available (curtailment shaded)', x: s.x, y: s.series[avail], line: { color: p[tech], width: 1, dash: 'dot' }, fill: 'tonexty', fillcolor: alpha(p.curtailment, 0.28), hovertemplate: '%{y:,.0f} MW<extra>Available</extra>' },
          ]
        : [],
    [s, p, tech, avail, disp],
  );
  const layout = useMemo<Partial<Layout>>(() => ({ xaxis: xaxisWithSync(sync.range), yaxis: { title: { text: 'MW' }, tickformat: ',.0f', rangemode: 'tozero' } }), [sync.range]);
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel={`${tech} availability versus dispatch with curtailment shaded`} filename={`${run.run_id}-${tech}-availability`} />;
}

/** Battery state of charge plus charge/discharge power. */
export function BatteryChart({ run, scenario, height = 240 }: SeriesChartProps) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const data = useMemo<Data[]>(
    () =>
      s
        ? [
            { type: 'bar', name: 'Discharge (MW)', x: s.x, y: s.series.battery_discharge, marker: { color: p.battery }, yaxis: 'y2', hovertemplate: '%{y:,.0f} MW<extra>Discharge</extra>' },
            { type: 'bar', name: 'Charge (MW, negative)', x: s.x, y: neg(s.series.battery_charge), marker: { color: p.charging }, yaxis: 'y2', hovertemplate: '%{y:,.0f} MW<extra>Charge</extra>' },
            { type: 'scatter', mode: 'lines', name: 'State of charge (MWh)', x: s.x, y: s.series.soc_mwh, line: { color: p.demand, width: 1.6 }, hovertemplate: '%{y:,.0f} MWh<extra>SOC</extra>' },
          ]
        : [],
    [s, p],
  );
  const layout = useMemo<Partial<Layout>>(
    () => ({
      barmode: 'relative',
      bargap: 0,
      xaxis: xaxisWithSync(sync.range, { anchor: 'y2' }),
      yaxis: { title: { text: 'SOC (MWh)' }, tickformat: ',.0f', domain: [0.52, 1], rangemode: 'tozero' },
      yaxis2: { title: { text: 'Power (MW)' }, tickformat: ',.0f', domain: [0, 0.44], anchor: 'x', zeroline: true },
    }),
    [sync.range],
  );
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel="Battery state of charge and charge/discharge power" filename={`${run.run_id}-battery`} />;
}

/** Reservoir inflow, turbine release and spill (hm³/h) plus hydro production. */
export function HydroFlowChart({ run, scenario, height = 260 }: SeriesChartProps) {
  const { theme } = useTheme();
  const s = useSeries(run, scenario);
  const sync = useSyncX();
  const p = palette(theme);
  const data = useMemo<Data[]>(
    () =>
      s
        ? [
            { type: 'scatter', mode: 'lines', name: 'Inflow (hm³/h)', x: s.x, y: s.series.inflow_hm3_h, line: { color: p.accent, width: 1.3 }, hovertemplate: '%{y:,.3f} hm³/h<extra>Inflow</extra>' },
            { type: 'scatter', mode: 'lines', name: 'Turbine release (hm³/h)', x: s.x, y: s.series.release_hm3_h, line: { color: p.hydro, width: 1.3 }, hovertemplate: '%{y:,.3f} hm³/h<extra>Release</extra>' },
            { type: 'scatter', mode: 'lines', name: 'Spill (hm³/h)', x: s.x, y: s.series.spill_hm3_h, line: { color: p.unserved, width: 1.1, dash: 'dot' }, hovertemplate: '%{y:,.3f} hm³/h<extra>Spill</extra>' },
            { type: 'scatter', mode: 'lines', name: 'Hydro production (MW)', x: s.x, y: s.series.hydro, yaxis: 'y2', line: { color: p.hydro, width: 1.2 }, fill: 'tozeroy', fillcolor: alpha(p.hydro, 0.18), hovertemplate: '%{y:,.0f} MW<extra>Hydro</extra>' },
          ]
        : [],
    [s, p],
  );
  const layout = useMemo<Partial<Layout>>(
    () => ({
      xaxis: xaxisWithSync(sync.range, { anchor: 'y2' }),
      yaxis: { title: { text: 'Water flow (hm³/h)' }, domain: [0.55, 1], rangemode: 'tozero' },
      yaxis2: { title: { text: 'Hydro (MW)' }, domain: [0, 0.45], anchor: 'x', rangemode: 'tozero', tickformat: ',.0f' },
    }),
    [sync.range],
  );
  if (!s) return <NoSeries />;
  return <Plot data={data} layout={layout} height={height} onRelayout={sync.onRelayout} ariaLabel="Reservoir inflow, release and spill, and hydro production" filename={`${run.run_id}-hydro-flows`} />;
}

export interface SankeyFlows {
  labels: string[];
  colors: string[];
  source: number[];
  target: number[];
  value: number[];
}

/**
 * Energy-flow Sankey built only from payload values:
 * generation by source (scenario metrics), curtailment, unserved energy, exports, and battery
 * charge/discharge/losses (timeseries sums × Δt when available).
 */
export function buildSankey(m: Partial<ScenarioMetrics>, run: RunPayload | null, colors: Record<Tech, string>): SankeyFlows {
  const labels: string[] = [];
  const nodeColors: string[] = [];
  const idx = (label: string, color: string) => {
    let i = labels.indexOf(label);
    if (i < 0) {
      labels.push(label);
      nodeColors.push(color);
      i = labels.length - 1;
    }
    return i;
  };
  const source: number[] = [];
  const target: number[] = [];
  const value: number[] = [];
  const link = (a: number, b: number, v: number | null | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 1e-6) {
      source.push(a);
      target.push(b);
      value.push(v);
    }
  };
  const grid = idx('Grid (single node)', colors.accent);
  const demand = idx('Demand', colors.demand);
  link(idx('Hydro reservoir', colors.hydro), grid, m.hydro_res_mwh);
  link(idx('Run-of-river', colors.ror), grid, m.ror_mwh);
  const solar = idx('Solar PV', colors.solar);
  link(solar, grid, m.pv_mwh);
  const wind = idx('Wind', colors.wind);
  link(wind, grid, m.wind_mwh);
  link(idx('Imports', colors.imports), grid, m.imports_mwh);
  const curt = idx('Curtailment', colors.curtailment);
  link(solar, curt, m.pv_curtail_mwh);
  link(wind, curt, m.wind_curtail_mwh);
  link(grid, demand, m.served_mwh);
  link(idx('Unserved energy', colors.unserved), demand, m.ens_mwh);
  link(grid, idx('Exports', colors.exports), m.exports_mwh);
  const s = run ? seriesFor(run) : null;
  if (s && run && run.scenarios.length === 1) {
    const dt = run.horizon?.resolution_h ?? 1;
    const ch = sum(s.series.battery_charge) * dt;
    const dis = sum(s.series.battery_discharge) * dt;
    if (ch > 1e-6 || dis > 1e-6) {
      const bat = idx('Battery', colors.battery);
      link(grid, bat, ch);
      link(bat, grid, dis);
      link(bat, idx('Battery losses', colors.imports), m.battery_losses_mwh);
    }
  }
  // drop unused nodes is unnecessary: Plotly hides nodes without links
  return { labels, colors: nodeColors, source, target, value };
}

export function EnergySankey({ metrics, run, height = 340, horizonLabel }: { metrics: Partial<ScenarioMetrics>; run: RunPayload | null; height?: number; horizonLabel: string }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const f = useMemo(() => buildSankey(metrics, run, p), [metrics, run, p]);
  const data = useMemo<Data[]>(
    () => [
      {
        type: 'sankey',
        arrangement: 'snap',
        valueformat: ',.0f',
        valuesuffix: ' MWh',
        node: { label: f.labels, color: f.colors, pad: 18, thickness: 12, line: { width: 0 }, hovertemplate: '%{label}: %{value:,.0f} MWh<extra></extra>' },
        link: { source: f.source, target: f.target, value: f.value, color: f.source.map((s) => alpha(f.colors[s], theme === 'dark' ? 0.32 : 0.4)), hovertemplate: '%{source.label} → %{target.label}<br>%{value:,.0f} MWh<extra></extra>' },
      } as unknown as Data,
    ],
    [f, theme],
  );
  const layout = useMemo<Partial<Layout>>(() => ({ margin: { l: 8, r: 8, t: 8, b: 8 }, hovermode: 'closest', font: { size: 11 } }), []);
  if (f.value.length === 0) return <EmptyState title="No energy flows">This payload has no positive energy totals.</EmptyState>;
  return <Plot data={data} layout={layout} height={height} ariaLabel={`Energy-flow Sankey over ${horizonLabel}`} filename={`${run?.run_id ?? 'run'}-sankey`} />;
}
