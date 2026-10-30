import { useMemo } from 'react';
import type { Data } from 'plotly.js';
import { useExperiment } from '../../api/hooks';
import { REFERENCE_IDS, type ChronoCheckPayload, type ChronoCheckRow, type CrossCheckPayload } from '../../api/types';
import { palette } from '../../lib/colors';
import { DASH, fmtNum, fmtPct, fmtSeconds, isNum, meurParts, scenarioLabel } from '../../lib/format';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';
import { Badge, Panel } from '../ui/primitives';
import { DataTable, DownloadButtons, RunTag } from '../ui/run';
import { RefGate } from './RefGate';

const meur = (v: number | null | undefined) => meurParts(v).value;

/** Spearman rank correlation between two orderings of the same ids (computed from the payload's rank lists). */
export function spearman(a: string[], b: string[]): number | null {
  const common = a.filter((x) => b.includes(x));
  const n = common.length;
  if (n < 2) return null;
  const ra = new Map(a.filter((x) => common.includes(x)).map((x, i) => [x, i]));
  const rb = new Map(b.filter((x) => common.includes(x)).map((x, i) => [x, i]));
  const d2 = common.reduce((s, x) => s + ((ra.get(x) ?? 0) - (rb.get(x) ?? 0)) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

function DumbbellChart({ rows }: { rows: ChronoCheckRow[] }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const data = useMemo<Data[]>(() => {
    const y = rows.map((r) => r.name);
    const rw = rows.map((r) => (isNum(r.repweek_expected_total_keur) ? r.repweek_expected_total_keur / 1000 : null));
    const ch = rows.map((r) => (isNum(r.chrono_expected_total_keur) ? r.chrono_expected_total_keur / 1000 : null));
    const stems: Data[] = rows.map((_, i) => ({ type: 'scatter', mode: 'lines', x: [rw[i], ch[i]], y: [y[i], y[i]], line: { color: p.imports, width: 2 }, hoverinfo: 'skip', showlegend: false }));
    return [
      ...stems,
      { type: 'scatter', mode: 'markers', name: 'Representative weeks', x: rw, y, marker: { size: 11, color: p.uncertainty }, hovertemplate: '%{y}<br>rep. weeks: %{x:,.1f} M€/yr<extra></extra>' },
      { type: 'scatter', mode: 'markers', name: 'Full-year chronological', x: ch, y, marker: { size: 11, color: p.hydro, symbol: 'diamond' }, hovertemplate: '%{y}<br>chronological: %{x:,.1f} M€/yr<extra></extra>' },
    ];
  }, [rows, p]);
  return (
    <Plot
      data={data}
      layout={{ hovermode: 'closest', xaxis: { title: { text: 'Expected total annualised cost (M€/yr)' }, tickformat: ',.0f' }, yaxis: { type: 'category', automargin: true }, legend: { y: 1.08 }, margin: { t: 40, l: 150 } }}
      height={Math.max(240, 90 + rows.length * 30)}
      ariaLabel="Expected total cost per strategy: representative-week versus full-year chronological evaluation"
      filename="chronological-check"
    />
  );
}

/** exp-H-chronological-check: does the representative-week approximation rank strategies like a full-year chronological run? */
export function ChronoCheckPanel({ compact = false }: { compact?: boolean }) {
  const state = useExperiment<ChronoCheckPayload>(REFERENCE_IDS.chronoCheck);
  return (
    <Panel
      eyebrow="Approximation check"
      title="Representative-week vs full-year chronological evaluation"
      actions={state.data ? <><RunTag run={{ ...state.data, status: 'Optimal', reference: state.data.reference ?? true }} /><DownloadButtons runId={state.data.run_id} formats={['json']} /></> : undefined}
    >
      <RefGate id={REFERENCE_IDS.chronoCheck} state={state} height={220}>
        {(d) => {
          const rows = d.rows ?? [];
          const rc = d.rank_chronological ?? [];
          const rr = d.rank_representative_weeks ?? [];
          const rho = spearman(rc, rr);
          const name = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={rho !== null && rho > 0.8 ? 'ok' : 'caution'}>Spearman rank correlation ρ = {rho === null ? DASH : fmtNum(rho, 2)}</Badge>
                <Badge tone="neutral">{rows.length} strategies re-evaluated</Badge>
                {rc[0] && <Badge tone="hydro">cheapest (chronological): {name(rc[0])}</Badge>}
                {rr[0] && <Badge tone="uncertainty">cheapest (rep. weeks): {name(rr[0])}</Badge>}
              </div>
              {!compact && <DumbbellChart rows={rows} />}
              <DataTable
                dense
                caption="Expected and CVaR total cost per strategy under both evaluation methods"
                rows={rows}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'n', header: 'Strategy', cell: (r) => r.name },
                  { key: 'rw', header: 'Rep-week E[cost] M€/yr', align: 'right', cell: (r) => meur(r.repweek_expected_total_keur) },
                  { key: 'ch', header: 'Chrono E[cost] M€/yr', align: 'right', cell: (r) => meur(r.chrono_expected_total_keur) },
                  {
                    key: 'd',
                    header: 'Δ %',
                    align: 'right',
                    cell: (r) =>
                      isNum(r.repweek_expected_total_keur) && isNum(r.chrono_expected_total_keur) && Math.abs(r.chrono_expected_total_keur) > 1e-9
                        ? fmtPct((r.repweek_expected_total_keur - r.chrono_expected_total_keur) / Math.abs(r.chrono_expected_total_keur), 1)
                        : DASH,
                  },
                  { key: 'rcv', header: 'Rep-week CVaR M€/yr', align: 'right', cell: (r) => meur(r.repweek_cvar_total_keur) },
                  { key: 'ccv', header: 'Chrono CVaR M€/yr', align: 'right', cell: (r) => meur(r.chrono_cvar_total_keur) },
                  { key: 'ri', header: 'Rank chrono / rep-wk', align: 'right', cell: (r) => `${rc.indexOf(r.id) + 1 || DASH} / ${rr.indexOf(r.id) + 1 || DASH}` },
                ]}
              />
              <p className="text-[0.7rem] text-ink-3">
                Costs as reported in the artefact (kEUR → M€). ρ is computed in the browser from the two rank lists in the payload; ρ = 1 means both methods order the strategies identically.
              </p>
            </div>
          );
        }}
      </RefGate>
    </Panel>
  );
}

/** exp-validation: native LP vs independent PyPSA formulation. */
export function CrossCheckPanel() {
  const state = useExperiment<CrossCheckPayload>(REFERENCE_IDS.crossCheck);
  return (
    <Panel
      eyebrow="Independent cross-check"
      title="Native HydroFlex LP vs PyPSA formulation"
      actions={state.data ? <RunTag run={{ ...state.data, status: 'Optimal', reference: state.data.reference ?? true }} /> : undefined}
    >
      <RefGate id={REFERENCE_IDS.crossCheck} state={state} height={180}>
        {(d) => {
          const rows = d.rows ?? [];
          const worst = rows.reduce<number | null>((m, r) => (isNum(r.rel_diff) && (m === null || Math.abs(r.rel_diff) > m) ? Math.abs(r.rel_diff) : m), null);
          return (
            <div className="space-y-3">
              <Badge tone={worst !== null && worst < 1e-3 ? 'ok' : 'caution'}>max |relative objective difference| = {worst === null ? DASH : worst.toExponential(2)}</Badge>
              <DataTable
                dense
                caption="Objective agreement between the native LP and PyPSA"
                rows={rows}
                rowKey={(r, i) => `${r.scenario}-${r.hours}-${i}`}
                columns={[
                  { key: 's', header: 'Scenario', cell: (r) => scenarioLabel(r.scenario) },
                  { key: 'h', header: 'Hours', align: 'right', cell: (r) => fmtNum(r.hours, 0) },
                  { key: 'i', header: 'Investment', cell: (r) => (r.investment ? 'yes' : 'no') },
                  { key: 'n', header: 'Native obj. k€', align: 'right', cell: (r) => fmtNum(r.native_objective_keur, 1) },
                  { key: 'p', header: 'PyPSA obj. k€', align: 'right', cell: (r) => fmtNum(r.pypsa_objective_keur, 1) },
                  { key: 'r', header: 'Rel. diff', align: 'right', cell: (r) => (isNum(r.rel_diff) ? r.rel_diff.toExponential(2) : DASH) },
                  { key: 'v', header: 'Max |ΔV| hm³', align: 'right', cell: (r) => fmtNum(r.reservoir_max_abs_diff_hm3, 3) },
                  { key: 't', header: 'Native / PyPSA time', align: 'right', cell: (r) => `${fmtSeconds(r.native_seconds)} / ${fmtSeconds(r.pypsa_seconds)}` },
                ]}
              />
            </div>
          );
        }}
      </RefGate>
    </Panel>
  );
}
