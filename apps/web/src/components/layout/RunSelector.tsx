import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useExperimentList } from '../../api/hooks';
import type { ExperimentSummary } from '../../api/types';
import { fmtUtc, scenarioLabel } from '../../lib/format';
import { useApp } from '../../state/app';

const RUN_KINDS = new Set(['simulate', 'investment', 'stochastic']);

export function describeExperiment(e: ExperimentSummary): string {
  const scen = e.scenarios ? e.scenarios.split(',').map((s) => scenarioLabel(s.trim())).join(', ') : '';
  if (e.reference) return `${e.run_id} · reference · ${e.kind}${scen ? ` · ${scen}` : ''}`;
  return `${e.label ?? e.kind} · ${scen} · ${fmtUtc(e.created_utc)}`;
}

/** Selected run id from `?run=`; defaults to `defaultId`. */
export function useRunParam(defaultId: string): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const id = params.get('run') ?? defaultId;
  const set = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === defaultId) next.delete('run');
    else next.set('run', v);
    setParams(next, { replace: true });
  };
  return [id, set];
}

export function RunSelector({ value, onChange, kinds, label = 'Run' }: { value: string; onChange: (id: string) => void; kinds?: string[]; label?: string }) {
  const { registryVersion, liveRun } = useApp();
  const { list } = useExperimentList(30_000, registryVersion);
  const allowed = useMemo(() => new Set(kinds ?? [...RUN_KINDS]), [kinds]);
  const items = useMemo(() => {
    const xs = (list ?? []).filter((e) => allowed.has(String(e.kind)));
    const ref = xs.filter((e) => e.reference);
    const live = xs.filter((e) => !e.reference).slice(0, 40);
    return { ref, live };
  }, [list, allowed]);
  const known = new Set([...items.ref, ...items.live].map((e) => e.run_id));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor="run-selector" className="eyebrow">
        {label}
      </label>
      <select
        id="run-selector"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 max-w-[420px] rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink hover:border-line-strong"
      >
        {!known.has(value) && <option value={value}>{value}{list ? ' (not available yet)' : ''}</option>}
        {items.ref.length > 0 && (
          <optgroup label="Reference experiments">
            {items.ref.map((e) => (
              <option key={e.run_id} value={e.run_id}>
                {describeExperiment(e)}
              </option>
            ))}
          </optgroup>
        )}
        {items.live.length > 0 && (
          <optgroup label="Live / session runs">
            {items.live.map((e) => (
              <option key={e.run_id} value={e.run_id}>
                {e.run_id === liveRun?.run_id ? '● latest · ' : ''}
                {describeExperiment(e)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
