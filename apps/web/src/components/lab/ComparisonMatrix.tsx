import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import { isRunPayload, type ExperimentSummary, type RunPayload, type ScenarioMetrics } from '../../api/types';
import { DASH, fmtDelta, fmtNum, fmtUtc, isNum, scenarioLabel } from '../../lib/format';
import { annualCostKeur, primaryMetrics } from '../../lib/run';
import { describeExperiment } from '../layout/RunSelector';
import { Callout } from '../ui/feedback';
import { EmptyState, LoadingBlock, Select } from '../ui/primitives';
import { RunTag } from '../ui/run';

interface Row {
  label: string;
  unit: string;
  get: (r: RunPayload, m: Partial<ScenarioMetrics>) => number | null | undefined;
  scale?: number;
  digits?: number;
  /** lower is better → a negative delta is good */
  lowerBetter?: boolean;
}

const ROWS: Row[] = [
  { label: 'System cost (annualised)', unit: 'M€/yr', get: (r) => annualCostKeur(r), scale: 1e-3, digits: 2, lowerBetter: true },
  { label: 'Objective (horizon)', unit: 'M€', get: (r) => r.objective_keur, scale: 1e-3, digits: 2, lowerBetter: true },
  { label: 'Demand', unit: 'GWh', get: (_r, m) => m.demand_mwh, scale: 1e-3, digits: 1 },
  { label: 'Imports', unit: 'GWh', get: (_r, m) => m.imports_mwh, scale: 1e-3, digits: 1, lowerBetter: true },
  { label: 'Net imports', unit: 'GWh', get: (_r, m) => m.net_imports_mwh, scale: 1e-3, digits: 1, lowerBetter: true },
  { label: 'Unserved energy', unit: 'MWh', get: (_r, m) => m.ens_mwh, digits: 0, lowerBetter: true },
  { label: 'Loss-of-load hours', unit: 'h', get: (_r, m) => m.lol_hours, digits: 0, lowerBetter: true },
  { label: 'Domestic supply share', unit: '%', get: (_r, m) => m.domestic_supply_share, scale: 100, digits: 1 },
  { label: 'Curtailment share', unit: '%', get: (_r, m) => m.curtailment_share, scale: 100, digits: 2, lowerBetter: true },
  { label: 'Reservoir hydro', unit: 'GWh', get: (_r, m) => m.hydro_res_mwh, scale: 1e-3, digits: 1 },
  { label: 'Reservoir end volume', unit: 'hm³', get: (_r, m) => m.res_v_end_hm3, digits: 0 },
  { label: 'Mean shadow price', unit: '€/MWh', get: (_r, m) => m.price_mean_eur_mwh, digits: 1, lowerBetter: true },
  { label: 'Battery cycles', unit: 'cycles', get: (_r, m) => m.battery_cycles, digits: 2 },
  { label: 'Solar capacity', unit: 'MW', get: (r) => r.capacities?.pv, digits: 0 },
  { label: 'Battery energy', unit: 'MWh', get: (r) => r.capacities?.be, digits: 0 },
  { label: 'Solve time', unit: 's', get: (r) => r.solver?.total_seconds, digits: 2 },
];

function useRun(id: string) {
  const [state, setState] = useState<{ id: string; run: RunPayload | null; error: string | null }>({ id: '', run: null, error: null });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api
      .experiment(id)
      .then((d) => alive && setState({ id, run: isRunPayload(d) ? d : null, error: isRunPayload(d) ? null : 'Not a run payload' }))
      .catch((e: unknown) => alive && setState({ id, run: null, error: e instanceof ApiError ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [id]);
  return state.id === id ? state : { id, run: null, error: null };
}

/** Side-by-side comparison of two stored runs with deltas (B − A). Every number is read from the two payloads. */
export function ComparisonMatrix({ runs }: { runs: ExperimentSummary[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const idA = a || runs[1]?.run_id || '';
  const idB = b || runs[0]?.run_id || '';
  const A = useRun(idA);
  const B = useRun(idB);

  if (runs.length < 2) {
    return <EmptyState title="Run at least two scenarios to compare">Each live run is stored in the experiment registry; pick any two here to see a side-by-side matrix with deltas.</EmptyState>;
  }
  const opts = runs.map((r) => ({ value: r.run_id, label: describeExperiment(r) }));
  const ready = A.run && B.run;
  const mA = A.run ? primaryMetrics(A.run) : {};
  const mB = B.run ? primaryMetrics(B.run) : {};
  const sameHorizon = ready && A.run!.horizon?.hours === B.run!.horizon?.hours && A.run!.horizon?.start_utc === B.run!.horizon?.start_utc;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Run A (baseline)" value={idA} onChange={setA} options={opts} />
        <Select label="Run B (compared)" value={idB} onChange={setB} options={opts} />
      </div>
      {(A.error || B.error) && <Callout tone="warn">Could not load a run: {A.error ?? B.error}</Callout>}
      {!ready && !A.error && !B.error && <LoadingBlock height={200} label="Loading both payloads…" />}
      {ready && (
        <>
          {!sameHorizon && (
            <Callout tone="caution" title="Different horizons">
              These runs cover different time windows, so energy totals are not directly comparable; the annualised cost is the fairer comparison.
            </Callout>
          )}
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Scenario comparison matrix</caption>
              <thead>
                <tr className="border-b border-line-strong">
                  <th scope="col" className="eyebrow px-2 py-2 text-left font-normal">Metric</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">
                    A · {A.run!.scenarios.map((s) => s.label ?? scenarioLabel(s.key)).join(', ')}
                  </th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">
                    B · {B.run!.scenarios.map((s) => s.label ?? scenarioLabel(s.key)).join(', ')}
                  </th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">Δ (B − A)</th>
                  <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const sc = row.scale ?? 1;
                  const va = row.get(A.run!, mA);
                  const vb = row.get(B.run!, mB);
                  const d = isNum(va) && isNum(vb) ? (vb - va) * sc : null;
                  const pct = isNum(va) && isNum(vb) && Math.abs(va) > 1e-9 ? ((vb - va) / Math.abs(va)) * 100 : null;
                  const good = d === null || Math.abs(d) < 1e-9 || row.lowerBetter === undefined ? null : row.lowerBetter ? d < 0 : d > 0;
                  const color = good === null ? 'var(--ink-2)' : good ? 'var(--ok)' : 'var(--warn)';
                  return (
                    <tr key={row.label} className="border-b border-line">
                      <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink-2">
                        {row.label} <span className="num text-[0.68rem] text-ink-3">{row.unit}</span>
                      </th>
                      <td className="num px-2 py-1.5 text-right text-ink">{isNum(va) ? fmtNum(va * sc, row.digits ?? 1) : DASH}</td>
                      <td className="num px-2 py-1.5 text-right text-ink">{isNum(vb) ? fmtNum(vb * sc, row.digits ?? 1) : DASH}</td>
                      <td className="num px-2 py-1.5 text-right" style={{ color }}>
                        {fmtDelta(d, row.digits ?? 1)}
                      </td>
                      <td className="num px-2 py-1.5 text-right text-ink-3">{pct === null ? DASH : fmtDelta(pct, 1, '%')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-ink-3">
            <span>A:</span>
            <RunTag run={A.run!} />
            <span className="ml-2">B:</span>
            <RunTag run={B.run!} />
            <span className="ml-2">
              Windows: {fmtUtc(A.run!.horizon?.start_utc, false)} ({fmtNum(A.run!.horizon?.hours, 0)} h) vs {fmtUtc(B.run!.horizon?.start_utc, false)} ({fmtNum(B.run!.horizon?.hours, 0)} h). Green = better for
              the system (lower cost / imports / ENS), red = worse.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
