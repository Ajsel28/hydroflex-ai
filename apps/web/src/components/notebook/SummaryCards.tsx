import { CircleCheck, CircleHelp, CircleX } from 'lucide-react';
import { useExperiment } from '../../api/hooks';
import { REFERENCE_IDS, type SummaryExperiment, type SummaryPayload } from '../../api/types';
import { fmtAuto, isNum, titleCase } from '../../lib/format';
import { RefGate } from '../frontier/RefGate';
import { Badge } from '../ui/primitives';
import { RunTag } from '../ui/run';

function fmtValue(v: unknown): string {
  if (isNum(v)) return fmtAuto(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(fmtValue).join(', ');
  return JSON.stringify(v);
}

export function SupportBadge({ supported }: { supported: boolean | null | undefined }) {
  if (supported === true)
    return (
      <Badge tone="ok">
        <CircleCheck size={11} aria-hidden /> hypothesis supported
      </Badge>
    );
  if (supported === false)
    return (
      <Badge tone="warn">
        <CircleX size={11} aria-hidden /> hypothesis not supported
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <CircleHelp size={11} aria-hidden /> inconclusive / not tested
    </Badge>
  );
}

function Card({ e }: { e: SummaryExperiment }) {
  const metrics = Object.entries(e.metrics ?? {}).slice(0, 10);
  const config = typeof e.configuration === 'string' ? e.configuration : e.configuration ? Object.entries(e.configuration).map(([k, v]) => `${titleCase(k)}: ${fmtValue(v)}`).join(' · ') : null;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-line bg-panel-2/40 p-4 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="num text-[0.68rem] text-ink-3">{e.id}</span>
        <SupportBadge supported={e.supported} />
      </div>
      <h3 className="mt-1.5 font-serif text-[1.05rem] leading-snug text-ink">{e.title}</h3>
      {e.hypothesis && (
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-2">
          <span className="eyebrow mr-1.5">Hypothesis</span>
          {e.hypothesis}
        </p>
      )}
      {config && (
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-3">
          <span className="eyebrow mr-1.5">Configuration</span>
          {config}
        </p>
      )}
      {e.finding && (
        <p className="mt-2 border-l-2 border-hydro pl-3 text-[0.82rem] leading-relaxed text-ink">
          <span className="eyebrow mr-1.5 text-hydro">Finding</span>
          {e.finding}
        </p>
      )}
      {metrics.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.72rem]">
          {metrics.map(([k, v]) => (
            <div key={k} className="flex min-w-0 justify-between gap-2 border-b border-line/60 py-0.5">
              <dt className="min-w-0 truncate text-ink-3" title={k}>
                {k}
              </dt>
              <dd className="num min-w-0 max-w-[60%] truncate text-right text-ink" title={fmtValue(v)}>{fmtValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {e.limitations && (
        <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-3">
          <span className="eyebrow mr-1.5 text-caution">Limitations</span>
          {e.limitations}
        </p>
      )}
    </article>
  );
}

/** Experiment cards from ref-summary (hypothesis → configuration → finding → limitations). */
export function SummaryCards() {
  const state = useExperiment<SummaryPayload>(REFERENCE_IDS.summary);
  return (
    <RefGate id={REFERENCE_IDS.summary} state={state} height={260}>
      {(d) => (
        <div className="space-y-3">
          <RunTag run={{ ...d, status: 'Optimal', reference: d.reference ?? true }} />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {(d.experiments ?? []).map((e) => (
              <Card key={e.id} e={e} />
            ))}
          </div>
        </div>
      )}
    </RefGate>
  );
}
