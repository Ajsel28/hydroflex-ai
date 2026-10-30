import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { useExperiment } from '../../api/hooks';
import { REFERENCE_IDS, type MarginalPayload, type MarginalRow } from '../../api/types';
import { palette } from '../../lib/colors';
import { fmtNum, isNum, scenarioLabel, titleCase } from '../../lib/format';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';
import { Badge, Panel } from '../ui/primitives';
import { DataTable, RunTag } from '../ui/run';
import { RefGate } from './RefGate';

/** One small chart per resource (units differ between resources, so never one shared axis). */
function ResourceChart({ resource, unit, rows }: { resource: string; unit: string; rows: MarginalRow[] }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const y = rows.map((r) => scenarioLabel(r.scenario));
  const data = useMemo<Data[]>(() => {
    const lo = rows.map((r) => (isNum(r.fd_right_keur_per_unit_yr) && isNum(r.fd_left_keur_per_unit_yr) ? Math.min(r.fd_right_keur_per_unit_yr, r.fd_left_keur_per_unit_yr) : null));
    const hi = rows.map((r) => (isNum(r.fd_right_keur_per_unit_yr) && isNum(r.fd_left_keur_per_unit_yr) ? Math.max(r.fd_right_keur_per_unit_yr, r.fd_left_keur_per_unit_yr) : null));
    return [
      {
        type: 'bar',
        orientation: 'h',
        name: 'Finite-difference interval [Δ⁺, Δ⁻]',
        y,
        base: lo,
        x: hi.map((h, i) => (isNum(h) && isNum(lo[i]) ? Math.max(h - (lo[i] as number), 0) : null)),
        marker: { color: p.uncertainty, opacity: 0.35 },
        width: 0.45,
        hovertemplate: `Δ interval: %{base:,.2f} → %{customdata:,.2f} kEUR/${unit}·yr<extra></extra>`,
        customdata: hi,
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Dual (reduced cost)',
        y,
        x: rows.map((r) => r.dual_keur_per_unit_yr),
        marker: { color: p.hydro, size: 10, symbol: 'diamond', line: { color: theme === 'dark' ? '#060b14' : '#fff', width: 2 } },
        hovertemplate: `Dual: %{x:,.2f} kEUR/${unit}·yr<extra></extra>`,
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Annualised cost',
        y,
        x: rows.map((r) => r.annualised_cost_keur_per_unit_yr),
        marker: { color: p.money, size: 10, symbol: 'line-ns', line: { color: p.money, width: 3 } },
        hovertemplate: `Annualised cost: %{x:,.2f} kEUR/${unit}·yr<extra></extra>`,
      },
    ];
  }, [rows, y, p, theme, unit]);
  const layout = useMemo<Partial<Layout>>(
    () => ({
      hovermode: 'closest',
      barmode: 'overlay',
      xaxis: { title: { text: `kEUR per ${unit} per year` }, tickformat: ',.0f', zeroline: true },
      yaxis: { type: 'category', automargin: true },
      legend: { y: 1.08 },
      margin: { l: 110, t: 40 },
    }),
    [unit],
  );
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{titleCase(resource)}</h3>
        <span className="num text-[0.68rem] text-ink-3">kEUR/{unit}·yr</span>
      </div>
      <Plot data={data} layout={layout} height={Math.max(180, 90 + rows.length * 36)} ariaLabel={`Marginal value of ${resource}: dual versus finite-difference bounds and annualised cost`} filename={`marginal-${resource}`} />
    </div>
  );
}

export function MarginalPanel() {
  const state = useExperiment<MarginalPayload>(REFERENCE_IDS.marginal);
  return (
    <Panel
      eyebrow="ref-J-marginal"
      title="Marginal value of flexibility — dual vs finite differences"
      actions={state.data ? <RunTag run={{ ...state.data, status: 'Optimal', reference: state.data.reference ?? true }} /> : undefined}
    >
      <RefGate id={REFERENCE_IDS.marginal} state={state} height={240}>
        {(d) => {
          const groups = new Map<string, MarginalRow[]>();
          d.rows.forEach((r) => groups.set(r.resource, [...(groups.get(r.resource) ?? []), r]));
          return (
            <div className="space-y-4">
              <p className="max-w-3xl text-sm leading-relaxed text-ink-2">
                The LP value function is piecewise-linear and convex in each capacity, so the dual (reduced cost) is a <em>local subgradient</em> that should lie inside the interval spanned by the
                right (Δ⁺) and left (Δ⁻) finite differences. Where the marginal value exceeds the annualised cost, one more unit would pay for itself — locally.
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {[...groups.entries()].map(([res, rows]) => (
                  <ResourceChart key={res} resource={res} unit={rows[0]?.unit ?? 'unit'} rows={rows} />
                ))}
              </div>
              <DataTable
                caption="Marginal value rows"
                dense
                rows={d.rows}
                rowKey={(r, i) => `${r.resource}-${r.scenario}-${i}`}
                columns={[
                  { key: 'res', header: 'Resource', cell: (r) => titleCase(r.resource) },
                  { key: 'sc', header: 'Scenario', cell: (r) => scenarioLabel(r.scenario) },
                  { key: 'base', header: 'Base cap.', align: 'right', cell: (r) => `${fmtNum(r.base_capacity, 0)} ${r.unit}` },
                  { key: 'delta', header: 'Δ', align: 'right', cell: (r) => `${fmtNum(r.delta, 0)} ${r.unit}` },
                  { key: 'r', header: 'Δ⁺ (right)', align: 'right', cell: (r) => fmtNum(r.fd_right_keur_per_unit_yr, 2) },
                  { key: 'c', header: 'Central', align: 'right', cell: (r) => fmtNum(r.fd_central_keur_per_unit_yr, 2) },
                  { key: 'l', header: 'Δ⁻ (left)', align: 'right', cell: (r) => fmtNum(r.fd_left_keur_per_unit_yr, 2) },
                  { key: 'd', header: 'Dual', align: 'right', cell: (r) => fmtNum(r.dual_keur_per_unit_yr, 2) },
                  { key: 'a', header: 'Annualised cost', align: 'right', cell: (r) => fmtNum(r.annualised_cost_keur_per_unit_yr, 2) },
                  { key: 'rel', header: 'Dual', cell: (r) => (r.dual_reliable ? <Badge tone="ok">reliable</Badge> : <Badge tone="caution">degenerate?</Badge>) },
                ]}
              />
              <p className="text-[0.7rem] text-ink-3">Values in kEUR per unit of capacity per year (unit per row). All numbers from the ref-J-marginal payload.</p>
            </div>
          );
        }}
      </RefGate>
    </Panel>
  );
}
