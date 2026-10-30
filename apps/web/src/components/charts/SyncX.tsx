import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { extractXRange } from './plotTheme';

interface SyncCtx {
  range: [string, string] | null;
  setRange: (r: [string, string] | null) => void;
  /** Feed a plotly_relayout event; updates the shared range if the x-axis changed. */
  onRelayout: (e: Record<string, unknown>) => void;
}

const Ctx = createContext<SyncCtx | null>(null);

/** Shares one x-range among stacked time-series charts: zoom on one, all follow. */
export function SyncXProvider({ children, initial = null }: { children: ReactNode; initial?: [string, string] | null }) {
  const [range, setRangeState] = useState<[string, string] | null>(initial);
  const setRange = useCallback((r: [string, string] | null) => {
    setRangeState((cur) => {
      if (cur === r) return cur;
      if (cur && r && cur[0] === r[0] && cur[1] === r[1]) return cur;
      return r;
    });
  }, []);
  const onRelayout = useCallback(
    (e: Record<string, unknown>) => {
      const r = extractXRange(e);
      if (r !== undefined) setRange(r);
    },
    [setRange],
  );
  const value = useMemo(() => ({ range, setRange, onRelayout }), [range, setRange, onRelayout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the shared range, or a no-op local controller when no provider is mounted. */
export function useSyncX(): SyncCtx {
  const c = useContext(Ctx);
  return c ?? { range: null, setRange: () => undefined, onRelayout: () => undefined };
}
