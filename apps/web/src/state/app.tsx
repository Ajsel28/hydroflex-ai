import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyServerLimits } from '../lib/validation';
import { ApiError, api, primeExperiment } from '../api/client';
import type { Health, InvestmentRequest, RunPayload, SimulateRequest, StochasticRequest } from '../api/types';
import { cleanLabel } from '../lib/format';
import { useToast } from './toast';

/** Shown until a payload supplies its own `data_label` (taken verbatim from the contract). */
export const DEFAULT_DATA_LABEL =
  'PV/wind: weather-derived from NASA POWER (not measured output) · inflows: reconstructed from NASA POWER precipitation (not gauged) · demand & prices: SYNTHETIC RESEARCH DEMONSTRATION DATA — NOT OBSERVED GRID OPERATIONS';

export type SolverState = 'idle' | 'running' | 'optimal' | 'infeasible' | 'error';

export interface SolverStatus {
  state: SolverState;
  detail?: string;
  startedAt?: number;
}

export type RunMode = 'simulate' | 'investment' | 'stochastic';
export type RunBody =
  | { mode: 'simulate'; body: SimulateRequest }
  | { mode: 'investment'; body: InvestmentRequest }
  | { mode: 'stochastic'; body: StochasticRequest };

interface AppCtx {
  health: Health | null;
  apiOnline: boolean | null;
  solver: SolverStatus;
  dataLabel: string;
  liveRun: RunPayload | null;
  registryVersion: number;
  presentation: boolean;
  setPresentation: (v: boolean) => void;
  /** Run an optimisation against the live API; updates the solver pill and toasts. Throws ApiError. */
  runModel: (req: RunBody, signal?: AbortSignal) => Promise<RunPayload>;
  noteDataLabel: (label: string | null | undefined) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [solver, setSolver] = useState<SolverStatus>({ state: 'idle' });
  const [dataLabel, setDataLabel] = useState(DEFAULT_DATA_LABEL);
  const [liveRun, setLiveRun] = useState<RunPayload | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [presentation, setPresentation] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 6000);
      api
        .health({ signal: ctrl.signal })
        .then((h) => {
          if (!alive) return;
          applyServerLimits(h.limits);
          setHealth(h);
          setApiOnline(true);
        })
        .catch(() => alive && setApiOnline(false))
        .finally(() => window.clearTimeout(t));
    };
    check();
    const id = window.setInterval(check, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const noteDataLabel = useCallback((label: string | null | undefined) => {
    if (label) setDataLabel(cleanLabel(label));
  }, []);

  const runModel = useCallback(
    async (req: RunBody, signal?: AbortSignal) => {
      if (running.current) throw new ApiError('A run is already in progress in this browser tab', 0);
      if (health?.deployment === 'static-snapshot') {
        const err = new ApiError(
          'Live optimisation is not available on this static deployment. It serves the verified reference experiments only; run the API locally (see README) for live HiGHS solves.',
          503,
        );
        setSolver({ state: 'error', detail: 'static deployment' });
        push({ tone: 'info', title: 'Live solver unavailable here', detail: err.message }, 10000);
        throw err;
      }
      running.current = true;
      setSolver({ state: 'running', startedAt: Date.now(), detail: req.mode });
      try {
        const out =
          req.mode === 'simulate'
            ? await api.simulate(req.body, { signal })
            : req.mode === 'investment'
              ? await api.optimizeInvestments(req.body, { signal })
              : await api.optimizeStochastic(req.body, { signal });
        primeExperiment(out);
        setLiveRun(out);
        noteDataLabel(out.data_label);
        setRegistryVersion((v) => v + 1);
        const status = out.solver?.status ?? out.status;
        if (out.optimal) {
          setSolver({ state: 'optimal', detail: status });
          push({ tone: 'success', title: `Solved — HiGHS ${status}`, detail: `${out.run_id} in ${(out.solver?.total_seconds ?? 0).toFixed(2)} s` });
        } else {
          setSolver({ state: 'infeasible', detail: status });
          push({ tone: 'warning', title: `Solver returned “${status}”`, detail: 'See warnings and explanations for diagnosis.' }, 9000);
        }
        return out;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0);
        if (err.aborted) {
          setSolver({ state: 'idle', detail: 'cancelled' });
          push({ tone: 'info', title: 'Run cancelled', detail: 'The request was aborted in the browser; the server may still finish it.' });
        } else {
          setSolver({ state: 'error', detail: err.message });
          push({ tone: 'error', title: err.status ? `API error ${err.status}` : 'API unreachable', detail: err.message }, 10000);
        }
        throw err;
      } finally {
        running.current = false;
      }
    },
    [push, noteDataLabel, health],
  );

  const value = useMemo<AppCtx>(
    () => ({ health, apiOnline, solver, dataLabel, liveRun, registryVersion, presentation, setPresentation, runModel, noteDataLabel }),
    [health, apiOnline, solver, dataLabel, liveRun, registryVersion, presentation, runModel, noteDataLabel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppStateProvider');
  return c;
}
