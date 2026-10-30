import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Database, Download, FlaskConical, Info, Radio } from 'lucide-react';
import { downloadUrl, type DownloadFormat } from '../../api/client';
import type { Explanation, RunPayload, SolverInfo } from '../../api/types';
import { cleanLabel, fmtInt, fmtSeconds, fmtUtc, scenarioLabel } from '../../lib/format';
import { runProvenance } from '../../lib/run';
import { DEFAULT_DATA_LABEL } from '../../state/app';
import { Badge, StatList, cx } from './primitives';

type ProvRun = Parameters<typeof runProvenance>[0];

/** Visible run provenance: "Reference experiment · computed …" vs "Live run · … s · HiGHS Optimal". */
export function RunTag({ run, className }: { run: ProvRun; className?: string }) {
  const p = runProvenance(run);
  const tone = p.kind === 'reference' ? 'uncertainty' : p.kind === 'live' ? 'ok' : 'neutral';
  const Icon = p.kind === 'reference' ? Database : p.kind === 'live' ? Radio : FlaskConical;
  return (
    <Badge tone={tone} className={className}>
      <Icon size={11} aria-hidden />
      <span data-testid="run-tag">{p.text}</span>
    </Badge>
  );
}

/** The synthetic-data disclosure. Always shown on pages that display results. */
export function DataLabel({ label, compact = false, className }: { label?: string | null; compact?: boolean; className?: string }) {
  const text = cleanLabel(label) || DEFAULT_DATA_LABEL;
  return (
    <p className={cx('flex items-start gap-2 font-mono text-[0.68rem] leading-relaxed text-ink-3', className)} data-testid="data-label">
      <AlertTriangle size={12} className="mt-0.5 shrink-0 text-caution" aria-hidden />
      <span>
        {compact ? <span className="text-caution">Synthetic demand &amp; prices · </span> : null}
        {text}
      </span>
    </p>
  );
}

const sevIcon: Record<string, ReactNode> = {
  ok: <CheckCircle2 size={15} />,
  info: <Info size={15} />,
  warning: <AlertTriangle size={15} />,
  critical: <AlertOctagon size={15} />,
};
const sevColor: Record<string, string> = { ok: 'var(--ok)', info: 'var(--hydro)', warning: 'var(--caution)', critical: 'var(--warn)' };

export function Explanations({ items, limit, filter }: { items: Explanation[]; limit?: number; filter?: (e: Explanation) => boolean }) {
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  const list = [...items.filter(filter ?? (() => true))].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)).slice(0, limit ?? items.length);
  if (list.length === 0) return <p className="text-sm text-ink-3">The solver returned no interpretation notes for this run.</p>;
  return (
    <ul className="space-y-2.5">
      {list.map((e, i) => (
        <li key={i} className="flex gap-3 rounded-lg border border-line bg-panel-2/60 px-3 py-2.5">
          <span className="mt-0.5 shrink-0" style={{ color: sevColor[e.severity] ?? 'var(--ink-3)' }} aria-label={e.severity}>
            {sevIcon[e.severity] ?? <Info size={15} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{e.title}</span>
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">
                {e.kind}
                {e.scenario ? ` · ${scenarioLabel(e.scenario)}` : ''}
              </span>
            </div>
            <p className="mt-0.5 text-[0.8rem] leading-relaxed text-ink-2">{e.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DownloadButtons({ runId, formats = ['json', 'csv', 'metrics_csv'] }: { runId: string; formats?: DownloadFormat[] }) {
  const label: Record<DownloadFormat, string> = { json: 'JSON', csv: 'Timeseries CSV', metrics_csv: 'Metrics CSV' };
  return (
    <div className="flex flex-wrap gap-1.5">
      {formats.map((f) => (
        <a
          key={f}
          href={downloadUrl(runId, f)}
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink"
        >
          <Download size={12} aria-hidden />
          {label[f]}
        </a>
      ))}
    </div>
  );
}

export function SolverDiagnostics({ solver, run }: { solver: SolverInfo; run?: RunPayload }) {
  return (
    <StatList
      items={[
        { label: 'Solver', value: `${solver.name} ${solver.version ?? ''}` },
        { label: 'Status', value: solver.status },
        { label: 'Method', value: solver.method ?? '—' },
        { label: 'Build time', value: fmtSeconds(solver.build_seconds) },
        { label: 'Solve time', value: fmtSeconds(solver.solve_seconds) },
        { label: 'Total time', value: fmtSeconds(solver.total_seconds) },
        { label: 'Simplex iterations', value: fmtInt(solver.iterations?.simplex) },
        { label: 'IPM iterations', value: fmtInt(solver.iterations?.ipm) },
        { label: 'Variables × rows', value: `${fmtInt(solver.n_vars)} × ${fmtInt(solver.n_rows)}` },
        { label: 'Non-zeros', value: fmtInt(solver.n_nonzeros) },
        ...(run
          ? [
              { label: 'Horizon', value: `${fmtInt(run.horizon?.steps)} steps × ${run.horizon?.resolution_h ?? '—'} h` },
              { label: 'Start', value: fmtUtc(run.horizon?.start_utc) },
              { label: 'Boundary', value: run.horizon?.boundary ?? '—' },
            ]
          : []),
      ]}
    />
  );
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings?.length) return null;
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={i} className="flex gap-2 text-sm text-caution">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span className="text-ink-2">{w}</span>
        </li>
      ))}
    </ul>
  );
}

/** Simple responsive table. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  dense,
  onRowClick,
}: {
  columns: { key: string; header: ReactNode; cell: (r: T) => ReactNode; align?: 'left' | 'right'; className?: string }[];
  rows: T[];
  rowKey: (r: T, i: number) => string;
  caption?: string;
  dense?: boolean;
  onRowClick?: (r: T) => void;
}) {
  return (
    <div className="scrollbar-thin -mx-1 max-w-[calc(100vw-2.5rem)] overflow-x-auto px-1 sm:max-w-none">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line-strong">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('eyebrow whitespace-nowrap px-2 py-2 font-normal', c.align === 'right' ? 'text-right' : 'text-left')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={rowKey(r, i)}
              className={cx('border-b border-line', onRowClick && 'cursor-pointer hover:bg-panel-2')}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={cx('px-2', dense ? 'py-1.5' : 'py-2', c.align === 'right' ? 'num text-right' : 'text-left', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
