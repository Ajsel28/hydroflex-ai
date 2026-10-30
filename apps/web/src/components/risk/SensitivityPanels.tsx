import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import type { DroughtSweepRow, SensitivityPayload } from '../../api/types';
import { palette, type Tech } from '../../lib/colors';
import { fmtNum, isNum, scenarioLabel, titleCase } from '../../lib/format';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';
import { Heatmap } from '../frontier/Heatmap';
import { energyScale } from '../frontier/metrics';
import { Panel } from '../ui/primitives';

/** Unit conversion for the sensitivity `metric` (kEUR metrics shown in M€). */
function metricUnit(metric: string): { div: number; unit: string; label: string } {
  if (metric.endsWith('_keur_annualised')) return { div: 1000, unit: 'M€/yr', label: titleCase(metric.replace(/_keur_annualised$/, '')) + ' (annualised)' };
  if (metric.endsWith('_keur')) return { div: 1000, unit: 'M€', label: titleCase(metric.replace(/_keur$/, '')) };
  if (metric.endsWith('_mwh')) return { div: 1, unit: 'MWh', label: titleCase(metric.replace(/_mwh$/, '')) };
  return { div: 1, unit: '', label: titleCase(metric) };
}

export function TornadoChart({ d }: { d: SensitivityPayload }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const mu = metricUnit(d.metric);
  const rows = useMemo(
    () =>
      [...(d.tornado ?? [])]
        .map((r) => ({ r, swing: isNum(r.metric_high) && isNum(r.metric_low) ? Math.abs(r.metric_high - r.metric_low) : -1 }))
        .sort((a, b) => a.swing - b.swing)
        .map((x) => x.r),
    [d.tornado],
  );
  const base = rows.find((r) => isNum(r.metric_base))?.metric_base ?? null;
  const data = useMemo<Data[]>(() => {
    const y = rows.map((r) => r.label);
    const delta = (v: number | null, b: number | null) => (isNum(v) && isNum(b) ? (v - b) / mu.div : null);
    return [
      {
        type: 'bar',
        orientation: 'h',
        name: 'Low parameter value',
        y,
        x: rows.map((r) => delta(r.metric_low, r.metric_base)),
        customdata: rows.map((r) => [r.low_value, isNum(r.metric_low) ? r.metric_low / mu.div : null]),
        marker: { color: p.hydro },
        hovertemplate: `%{y}<br>low (%{customdata[0]}): %{customdata[1]:,.1f} ${mu.unit}<br>Δ vs base %{x:+,.1f} ${mu.unit}<extra></extra>`,
      },
      {
        type: 'bar',
        orientation: 'h',
        name: 'High parameter value',
        y,
        x: rows.map((r) => delta(r.metric_high, r.metric_base)),
        customdata: rows.map((r) => [r.high_value, isNum(r.metric_high) ? r.metric_high / mu.div : null]),
        marker: { color: p.money },
        hovertemplate: `%{y}<br>high (%{customdata[0]}): %{customdata[1]:,.1f} ${mu.unit}<br>Δ vs base %{x:+,.1f} ${mu.unit}<extra></extra>`,
      },
    ];
  }, [rows, p, mu]);
  const layout = useMemo<Partial<Layout>>(
    () => ({
      barmode: 'overlay',
      hovermode: 'closest',
      bargap: 0.35,
      xaxis: { title: { text: `Change in ${mu.label.toLowerCase()} vs base (${mu.unit})` }, zeroline: true, tickformat: '+,.0f' },
      yaxis: { type: 'category', automargin: true },
      legend: { y: 1.06 },
      margin: { l: 160, t: 40 },
    }),
    [mu],
  );
  return (
    <Panel eyebrow="One-at-a-time sensitivity" title="Tornado — what moves system cost most">
      {rows.length ? (
        <>
          <Plot data={data} layout={layout} height={Math.max(240, 80 + rows.length * 38)} ariaLabel="Tornado chart of parameter sensitivities" filename="hydroflex-tornado" />
          <p className="mt-1 text-[0.7rem] text-ink-3">
            Base {mu.label.toLowerCase()}: <span className="num text-ink-2">{isNum(base) ? `${fmtNum(base / mu.div, 1)} ${mu.unit}` : '—'}</span>. Bars sorted by total swing; hover for the parameter values.
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-3">No tornado rows in the payload.</p>
      )}
    </Panel>
  );
}

function SweepMini({ rows, field, title, tech, unit, div = 1, digits = 0 }: { rows: DroughtSweepRow[]; field: keyof DroughtSweepRow; title: string; tech: Tech; unit: string; div?: number; digits?: number }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const data = useMemo<Data[]>(() => {
    const groups = [...new Set(rows.map((r) => r.import_availability ?? 1))].sort((a, b) => b - a);
    return groups.map((g, gi) => {
      const rs = rows.filter((r) => (r.import_availability ?? 1) === g);
      return {
        type: 'scatter',
        mode: 'lines+markers',
        name: groups.length > 1 ? `Import availability ${Math.round(g * 100)} %` : title,
        x: rs.map((r) => r.severity * 100),
        y: rs.map((r) => {
          const v = r[field];
          return isNum(v) ? v / div : null;
        }),
        line: { color: p[tech], width: 2, dash: gi === 0 ? 'solid' : 'dash' },
        marker: { size: 7, symbol: gi === 0 ? 'circle' : 'diamond', color: gi === 0 ? p[tech] : theme === 'dark' ? '#060b14' : '#fff', line: { color: p[tech], width: 1.5 } },
        hovertemplate: `Drought %{x:.0f} %${groups.length > 1 ? ` · availability ${Math.round(g * 100)} %` : ''}<br>%{y:,.${digits}f} ${unit}<extra></extra>`,
      } as Data;
    });
  }, [rows, field, div, p, tech, title, unit, digits, theme]);
  const multi = new Set(rows.map((r) => r.import_availability ?? 1)).size > 1;
  const layout = useMemo<Partial<Layout>>(
    () => ({ hovermode: 'closest', showlegend: multi, legend: { y: 1.18, font: { size: 10 } }, xaxis: { title: { text: 'Inflow reduction (%)' }, ticksuffix: '%' }, yaxis: { title: { text: unit }, rangemode: 'tozero', tickformat: ',.0f' }, margin: { t: multi ? 34 : 12 } }),
    [unit, multi],
  );
  return (
    <div className="rounded-xl border border-line p-3">
      <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
      <Plot data={data} layout={layout} height={210} ariaLabel={`${title} versus drought severity`} filename={`drought-sweep-${String(field)}`} />
    </div>
  );
}

export function DroughtSweep({ d }: { d: SensitivityPayload }) {
  const rows = [...(d.drought_sweep ?? [])].sort((a, b) => a.severity - b.severity);
  const imp = energyScale(rows.map((r) => r.imports_mwh));
  const hyd = energyScale(rows.map((r) => r.hydro_mwh));
  return (
    <Panel eyebrow="Drought-severity sweep" title="How the system degrades as inflows fall">
      {rows.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SweepMini rows={rows} field="total_cost_keur_annualised" title="Total annualised cost" tech="money" unit="M€/yr" div={1000} digits={1} />
          <SweepMini rows={rows} field="imports_mwh" title="Imports" tech="imports" unit={`${imp.unit}/yr`} div={imp.div} digits={imp.unit === 'TWh' ? 2 : 0} />
          <SweepMini rows={rows} field="ens_mwh" title="Energy not served" tech="unserved" unit="MWh/yr" />
          <SweepMini rows={rows} field="hydro_mwh" title="Reservoir hydro output" tech="hydro" unit={`${hyd.unit}/yr`} div={hyd.div} digits={hyd.unit === 'TWh' ? 2 : 0} />
          <SweepMini rows={rows} field="price_mean_eur_mwh" title="Mean system marginal cost" tech="price" unit="€/MWh" digits={1} />
        </div>
      ) : (
        <p className="text-sm text-ink-3">No sweep rows in the payload.</p>
      )}
      <p className="mt-2 text-[0.7rem] text-ink-3">Small multiples: each metric has its own axis (no dual axes). Severity = fractional reduction of reconstructed inflows. Where the payload sweeps several interconnector availabilities, each is drawn as its own line (solid = highest availability).</p>
    </Panel>
  );
}

export function SensitivityHeatmap({ d }: { d: SensitivityPayload }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const h = d.heatmap;
  if (!h || !h.x?.length || !h.y?.length) return null;
  const mu = metricUnit(h.metric);
  return (
    <Panel eyebrow="Two-way sensitivity" title={`${mu.label} — ${h.x_label} × ${h.y_label}`}>
      <Heatmap
        x={h.x.map((v) => (h.x_label.includes('drought') ? `${fmtNum(v * 100, 0)} %` : fmtNum(v, 2)))}
        y={h.y.map((v) => fmtNum(v, 0))}
        z={h.z.map((row) => row.map((v) => (isNum(v) ? v / mu.div : null)))}
        color={p.money}
        unit={mu.unit}
        xTitle={h.x_label}
        yTitle={h.y_label}
        ariaLabel={`Heatmap of ${mu.label} over ${h.x_label} and ${h.y_label}`}
        filename="sensitivity-heatmap"
      />
    </Panel>
  );
}

export function RegretMatrix({ d, names }: { d: SensitivityPayload; names?: Map<string, string> }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const r = d.robustness;
  if (!r || !r.strategies?.length) return null;
  const maxRegret = r.regret_keur.map((row) => Math.max(...row.filter(isNum)));
  const best = maxRegret.reduce((bi, v, i, a) => (v < a[bi] ? i : bi), 0);
  return (
    <Panel eyebrow="Robustness" title="Regret matrix — cost above the best strategy in each scenario">
      <Heatmap
        x={r.scenarios.map(scenarioLabel)}
        y={r.strategies.map((id) => names?.get(id) ?? id)}
        z={r.regret_keur.map((row) => row.map((v) => (isNum(v) ? v / 1000 : null)))}
        color={p.uncertainty}
        unit="M€/yr"
        xTitle="Scenario"
        ariaLabel="Regret of each strategy in each scenario"
        filename="regret-matrix"
      />
      <p className="mt-2 text-sm text-ink-2">
        Minimax-regret choice: <strong className="text-ink">{names?.get(r.strategies[best]) ?? r.strategies[best]}</strong> (worst-case regret{' '}
        <span className="num">{isNum(maxRegret[best]) ? `${fmtNum(maxRegret[best] / 1000, 1)} M€/yr` : '—'}</span>).
      </p>
    </Panel>
  );
}
