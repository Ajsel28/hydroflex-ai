import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './client';
import type { ExperimentSummary, StoredExperiment } from './types';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Run an async loader; re-runs when `key` changes. Optional polling while the result is "not found". */
export function useAsync<T>(loader: (() => Promise<T>) | null, key: string, pollNotFoundMs = 0): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean; key: string }>({
    data: null,
    error: null,
    loading: loader !== null,
    key,
  });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  // reset synchronously when the key changes (React "adjust state during render" pattern)
  if (state.key !== key) {
    setState({ data: null, error: null, loading: loader !== null, key });
  }

  useEffect(() => {
    const fn = loaderRef.current;
    if (!fn) return;
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false, key }))
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0);
        setState({ data: null, error: err, loading: false, key });
      });
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const notFound = state.error?.isNotFound || state.error?.isNetwork;
  useEffect(() => {
    if (!pollNotFoundMs || !notFound) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), pollNotFoundMs);
    return () => window.clearTimeout(id);
  }, [pollNotFoundMs, notFound, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

/** Load a stored experiment; polls every 30 s while it does not exist yet (reference artefacts are generated in parallel). */
export function useExperiment<T extends StoredExperiment = StoredExperiment>(id: string | null | undefined): AsyncState<T> {
  return useAsync<T>(id ? () => api.experiment<T>(id) : null, `exp:${id ?? ''}`, 30_000);
}

/** Registry listing, refreshed every `pollMs`. */
export function useExperimentList(pollMs = 30_000, refreshKey = 0) {
  const [list, setList] = useState<ExperimentSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .experiments({ signal: ctrl.signal })
      .then((r) => {
        setList(r.experiments);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
      });
    const id = window.setTimeout(() => setTick((t) => t + 1), pollMs);
    return () => {
      ctrl.abort();
      window.clearTimeout(id);
    };
  }, [pollMs, tick, refreshKey]);
  return { list, error, refresh: () => setTick((t) => t + 1) };
}
