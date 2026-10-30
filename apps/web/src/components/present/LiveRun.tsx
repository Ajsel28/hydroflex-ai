import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { ApiError } from '../../api/client';
import type { RunPayload, SimulateRequest } from '../../api/types';
import { energyParts, fmtNum, meurParts } from '../../lib/format';
import { annualCostKeur, primaryMetrics } from '../../lib/run';
import { useApp } from '../../state/app';
import { DispatchChart } from '../charts/RunCharts';
import { SyncXProvider } from '../charts/SyncX';
import { StatusBlock } from '../lab/RunResults';
import { Callout } from '../ui/feedback';
import { Button, Kpi } from '../ui/primitives';
import { RunTag } from '../ui/run';

export interface LiveState {
  run: RunPayload | null;
  error: ApiError | null;
  running: boolean;
  startedAt: number;
}

const idle: LiveState = { run: null, error: null, running: false, startedAt: 0 };

/** Executes real POST /api/simulate calls through the shared runner; exposes state + elapsed timer. */
export function useLiveRuns() {
  const { runModel } = useApp();
  const [states, setStates] = useState<Record<string, LiveState>>({});
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  const run = useCallback(
    async (key: string, body: SimulateRequest): Promise<RunPayload | null> => {
      const c = new AbortController();
      ctrl.current = c;
      setStates((s) => ({ ...s, [key]: { run: s[key]?.run ?? null, error: null, running: true, startedAt: Date.now() } }));
      try {
        const out = await runModel({ mode: 'simulate', body }, c.signal);
        setStates((s) => ({ ...s, [key]: { run: out, error: null, running: false, startedAt: 0 } }));
        return out;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
        setStates((s) => ({ ...s, [key]: { run: s[key]?.run ?? null, error: err.aborted ? null : err, running: false, startedAt: 0 } }));
        return null;
      }
    },
    [runModel],
  );
  const cancel = useCallback(() => ctrl.current?.abort(), []);
  const get = (key: string) => states[key] ?? idle;
  const anyRunning = Object.values(states).some((s) => s.running);
  return { run, cancel, get, anyRunning };
}

export function useElapsed(active: boolean, startedAt: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return active && now > startedAt ? (now - startedAt) / 1000 : 0;
}

export function RunButton({ state, onRun, onCancel, label, disabled }: { state: LiveState; onRun: () => void; onCancel: () => void; label: string; disabled?: boolean }) {
  const elapsed = useElapsed(state.running, state.startedAt);
  if (state.running)
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 font-mono text-sm text-hydro" role="status" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-hydro opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-hydro" />
          </span>
          HiGHS solving live… {elapsed.toFixed(1)} s
        </span>
        <Button variant="danger" size="sm" onClick={onCancel} icon={<Square size={12} />}>
          Cancel
        </Button>
      </div>
    );
  return (
    <Button variant="primary" size="lg" onClick={onRun} icon={<Play size={15} />} disabled={disabled}>
      {state.run ? `Re-run: ${label}` : label}
    </Button>
  );
}

/** Compact result: provenance tag, solver status, four KPIs, dispatch chart. */
export function CompactRun({ run, height = 300 }: { run: RunPayload; height?: number }) {
  const m = primaryMetrics(run);
  const cost = meurParts(annualCostKeur(run));
  const imp = energyParts(m.imports_mwh);
  const ens = energyParts(m.ens_mwh);
  const hydro = energyParts(m.hydro_res_mwh);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBlock run={run} />
        <RunTag run={run} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="System cost" value={cost.value} unit={`${cost.unit}/yr`} sub="annualised" tone="money" />
        <Kpi label="Reservoir hydro" value={hydro.value} unit={hydro.unit} sub={`${fmtNum(run.horizon?.hours, 0)} h window`} tone="hydro" />
        <Kpi label="Imports" value={imp.value} unit={imp.unit} sub={`mean price ${fmtNum(m.price_mean_eur_mwh, 1)} €/MWh`} />
        <Kpi label="Unserved energy" value={ens.value} unit={ens.unit} tone={(m.ens_mwh ?? 0) > 0 ? 'warn' : 'ok'} />
      </div>
      <SyncXProvider key={run.run_id}>
        <DispatchChart run={run} height={height} rangeSlider={false} />
      </SyncXProvider>
    </div>
  );
}

export function RunErrorNote({ error, onReference, referenceLabel }: { error: ApiError; onReference?: () => void; referenceLabel?: string }) {
  return (
    <Callout tone="warn" title={error.isNetwork ? 'The live API is unavailable' : `The live run failed${error.status ? ` (HTTP ${error.status})` : ''}`}>
      <p>{error.message}. No result is shown for this step because nothing was computed.</p>
      {onReference && (
        <button type="button" onClick={onReference} className="mt-2 text-sm font-semibold text-hydro underline-offset-2 hover:underline">
          Show {referenceLabel ?? 'the reference experiment'} instead (clearly labelled as reference)
        </button>
      )}
    </Callout>
  );
}
