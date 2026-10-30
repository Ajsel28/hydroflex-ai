import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DatabaseZap, RefreshCw } from 'lucide-react';
import { useExperiment, useExperimentList } from '../../api/hooks';
import { isRunPayload, type RunPayload } from '../../api/types';
import { useApp } from '../../state/app';
import { Button, EmptyState, LoadingBlock } from '../ui/primitives';

/**
 * Loads a RunPayload by id with loading / not-yet-generated / error states.
 * When a reference artefact is missing it offers the latest session run instead — clearly as a different run.
 */
export function RunLoader({ id, onSelect, children, height = 420 }: { id: string; onSelect: (id: string) => void; children: (run: RunPayload) => ReactNode; height?: number }) {
  const { data, error, loading, reload } = useExperiment(id);
  const { liveRun, registryVersion, noteDataLabel } = useApp();
  const { list } = useExperimentList(30_000, registryVersion);
  if (loading) return <LoadingBlock label={`Loading ${id}…`} height={height} />;
  if (error) {
    const latest = liveRun?.run_id ?? list?.find((e) => !e.reference && ['simulate', 'investment', 'stochastic'].includes(String(e.kind)))?.run_id;
    const isRef = id.startsWith('ref-');
    return (
      <EmptyState
        icon={<DatabaseZap size={28} />}
        title={error.isNotFound ? (isRef ? `Reference experiment “${id}” not generated yet` : `Run “${id}” not found`) : error.isNetwork ? 'API unreachable' : 'Could not load run'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {latest && latest !== id && (
              <Button variant="primary" onClick={() => onSelect(latest)}>
                Show latest session run instead
              </Button>
            )}
            <Link to="/lab" className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-sm text-ink hover:bg-panel-2">
              Run a live optimisation
            </Link>
            <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={reload}>
              Retry
            </Button>
          </div>
        }
      >
        {error.isNotFound && isRef ? (
          <>
            Reference artefacts are produced by <code className="num text-ink-2">python -m hydroflex.experiments.run_all</code>. This view checks again every 30 s and fills automatically when it appears.
          </>
        ) : (
          error.message
        )}
      </EmptyState>
    );
  }
  if (!data) return null;
  if (!isRunPayload(data)) return <EmptyState title="Unsupported experiment type">“{id}” is not a dispatch/investment/stochastic run.</EmptyState>;
  noteDataLabelOnce(data, noteDataLabel);
  return <>{children(data)}</>;
}

const seen = new WeakSet<object>();
function noteDataLabelOnce(run: RunPayload, note: (l: string) => void) {
  if (seen.has(run)) return;
  seen.add(run);
  queueMicrotask(() => note(run.data_label));
}
