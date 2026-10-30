import type { ReactNode } from 'react';
import { CloudOff, Hourglass } from 'lucide-react';
import type { AsyncState } from '../../api/hooks';
import { API_BASE } from '../../api/client';
import { EmptyState, LoadingBlock } from '../ui/primitives';

/**
 * Renders loading / "not generated yet" / API error states for a reference artefact,
 * and the children once the payload is available. useExperiment polls every 30 s while 404.
 */
export function RefGate<T>({ id, state, children, height = 320 }: { id: string; state: AsyncState<T>; children: (data: T) => ReactNode; height?: number }) {
  if (state.loading && !state.data) return <LoadingBlock label={`Loading ${id}…`} height={height} />;
  if (state.data) return <>{children(state.data)}</>;
  if (state.error?.isNotFound)
    return (
      <EmptyState icon={<Hourglass size={22} />} title="Reference experiment not generated yet">
        This view fills automatically when <code className="num text-ink-2">{id}</code> appears in the experiment registry (checked every 30 s). Generate it from the repository root with{' '}
        <code className="num text-ink-2">python -m hydroflex.experiments.run_all</code>.
      </EmptyState>
    );
  if (state.error?.isNetwork)
    return (
      <EmptyState icon={<CloudOff size={22} />} title="API unreachable">
        Could not reach <code className="num">{API_BASE}</code>. Start the backend (see docs/FRONTEND.md); this panel retries automatically.
      </EmptyState>
    );
  return (
    <EmptyState icon={<CloudOff size={22} />} title={`Could not load ${id}`} action={<button type="button" className="text-sm text-hydro underline" onClick={state.reload}>Retry</button>}>
      {state.error?.message ?? 'Unknown error'}
    </EmptyState>
  );
}
