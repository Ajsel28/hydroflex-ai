import type { RunPayload, ScenarioMetrics } from '../../api/types';
import { DASH, fmtDelta, fmtNum, isNum } from '../../lib/format';
import { annualCostKeur, primaryMetrics } from '../../lib/run';

interface Row {
  label: string;
  unit: string;
  get: (r: RunPayload, m: Partial<ScenarioMetrics>) => number | null | undefined;
  scale?: number;
  digits?: number;
  lowerBetter?: boolean;
}

export const DELTA_ROWS: Row[] = [
  { label: 'System cost (annualised)', unit: 'M€/yr', get: (r) => annualCostKeur(r), scale: 1e-3, digits: 2, lowerBetter: true },
  { label: 'Imports', unit: 'GWh', get: (_r, m) => m.imports_mwh, scale: 1e-3, digits: 2, lowerBetter: true },
  { label: 'Exports', unit: 'GWh', get: (_r, m) => m.exports_mwh, scale: 1e-3, digits: 2 },
  { label: 'Unserved energy', unit: 'MWh', get: (_r, m) => m.ens_mwh, digits: 1, lowerBetter: true },
  { label: 'Reservoir hydro', unit: 'GWh', get: (_r, m) => m.hydro_res_mwh, scale: 1e-3, digits: 2 },
  { label: 'Mean shadow price', unit: '€/MWh', get: (_r, m) => m.price_mean_eur_mwh, digits: 1, lowerBetter: true },
  { label: 'Peak shadow price', unit: '€/MWh', get: (_r, m) => m.price_max_eur_mwh, digits: 1, lowerBetter: true },
  { label: 'Battery cycles', unit: '', get: (_r, m) => m.battery_cycles, digits: 2 },
];

/** Two real payloads side by side with Δ = B − A. */
export function DeltaTable({ a, b, labelA, labelB, rows = DELTA_ROWS }: { a: RunPayload; b: RunPayload; labelA: string; labelB: string; rows?: Row[] }) {
  const ma = primaryMetrics(a);
  const mb = primaryMetrics(b);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">
          {labelB} compared with {labelA}
        </caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="eyebrow px-2 py-2 text-left font-normal">Metric</th>
            <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">{labelA}</th>
            <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">{labelB}</th>
            <th scope="col" className="eyebrow px-2 py-2 text-right font-normal">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sc = r.scale ?? 1;
            const va = r.get(a, ma);
            const vb = r.get(b, mb);
            const d = isNum(va) && isNum(vb) ? (vb - va) * sc : null;
            const good = d === null || Math.abs(d) < 1e-9 || r.lowerBetter === undefined ? null : r.lowerBetter ? d < 0 : d > 0;
            return (
              <tr key={r.label} className="border-b border-line">
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink-2">
                  {r.label} {r.unit && <span className="num text-[0.68rem] text-ink-3">{r.unit}</span>}
                </th>
                <td className="num px-2 py-1.5 text-right">{isNum(va) ? fmtNum(va * sc, r.digits ?? 1) : DASH}</td>
                <td className="num px-2 py-1.5 text-right">{isNum(vb) ? fmtNum(vb * sc, r.digits ?? 1) : DASH}</td>
                <td className="num px-2 py-1.5 text-right" style={{ color: good === null ? 'var(--ink-2)' : good ? 'var(--ok)' : 'var(--warn)' }}>
                  {fmtDelta(d, r.digits ?? 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
