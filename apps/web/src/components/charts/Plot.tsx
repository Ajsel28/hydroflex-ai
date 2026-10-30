import { useEffect, useMemo, useRef, useState } from 'react';
import type { Config, Data, Layout, PlotlyHTMLElement } from 'plotly.js';
import { useTheme } from '../../state/theme';
import { baseLayout, mergeLayout } from './plotTheme';
import { loadPlotly } from './plotlyLoader';

export interface PlotProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  height?: number;
  /** Accessible description of what the chart shows. */
  ariaLabel: string;
  filename?: string;
  className?: string;
  onRelayout?: (e: Record<string, unknown>) => void;
  onClick?: (points: { curveNumber: number; pointIndex: number; customdata?: unknown; x?: unknown; y?: unknown }[]) => void;
  onHoverX?: (x: unknown) => void;
}

const REMOVE: NonNullable<Config['modeBarButtonsToRemove']> = [
  'lasso2d',
  'select2d',
  'autoScale2d',
  'toggleSpikelines',
  'hoverClosestCartesian',
  'hoverCompareCartesian',
  'zoomIn2d',
  'zoomOut2d',
];

/**
 * Thin React-19-safe wrapper: Plotly.react inside an effect, events re-bound through refs,
 * ResizeObserver for responsive width, purge on unmount.
 */
export function Plot({ data, layout, config, height = 320, ariaLabel, filename = 'hydroflex-chart', className, onRelayout, onClick, onHoverX }: PlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const handlers = useRef({ onRelayout, onClick, onHoverX });
  useEffect(() => {
    handlers.current = { onRelayout, onClick, onHoverX };
  });

  const fullLayout = useMemo(() => mergeLayout(baseLayout(theme), { height, ...layout }), [theme, height, layout]);
  const fullConfig = useMemo<Partial<Config>>(
    () => ({
      displaylogo: false,
      responsive: true,
      displayModeBar: 'hover',
      modeBarButtonsToRemove: REMOVE,
      toImageButtonOptions: { format: 'svg', filename, scale: 1 },
      ...config,
    }),
    [config, filename],
  );

  const bound = useRef(false);
  useEffect(() => {
    let alive = true;
    const node = el.current;
    if (!node) return;
    loadPlotly()
      .then((Plotly) => {
        if (!alive || !node) return;
        return Plotly.react(node, data, fullLayout, fullConfig).then((gd: PlotlyHTMLElement) => {
          if (bound.current || typeof gd.on !== 'function') return;
          bound.current = true;
          gd.on('plotly_relayout', (e) => handlers.current.onRelayout?.(e as unknown as Record<string, unknown>));
          gd.on('plotly_click', (e) => {
            const pts = e.points.map((p) => ({
              curveNumber: p.curveNumber,
              pointIndex: p.pointIndex ?? p.pointNumber,
              customdata: p.customdata,
              x: p.x,
              y: p.y,
            }));
            handlers.current.onClick?.(pts);
          });
          gd.on('plotly_hover', (e) => handlers.current.onHoverX?.(e.points[0]?.x));
        });
      })
      .catch((e: unknown) => alive && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [data, fullLayout, fullConfig]);

  useEffect(() => {
    const node = el.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        loadPlotly()
          .then((P) => {
            if (node.isConnected && (node as unknown as { _fullLayout?: unknown })._fullLayout) P.Plots.resize(node);
          })
          .catch(() => undefined);
      });
    });
    ro.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      loadPlotly()
        .then((P) => P.purge(node))
        .catch(() => undefined);
      bound.current = false;
    };
  }, []);

  return (
    <figure className={className} aria-label={ariaLabel} style={{ margin: 0 }}>
      {failed ? (
        <div className="grid place-items-center text-sm text-ink-3" style={{ height }}>
          Chart library failed to load: {failed}
        </div>
      ) : (
        <div ref={el} style={{ width: '100%', minHeight: height }} data-testid="plot" data-traces={data.length} />
      )}
    </figure>
  );
}
