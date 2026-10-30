import type { Layout, RangeSelectorButton } from 'plotly.js';
import type { Theme } from '../../state/theme';

export const CHART_INK = {
  dark: { ink: '#E6EDF7', ink2: '#A9B6CA', ink3: '#7D8BA3', grid: 'rgba(148,163,184,0.10)', zero: 'rgba(148,163,184,0.35)', panel: '#0F182A', line: '#2A3B59' },
  light: { ink: '#0B1526', ink2: '#39475D', ink3: '#5B6880', grid: 'rgba(15,23,42,0.08)', zero: 'rgba(15,23,42,0.30)', panel: '#FFFFFF', line: '#C0CAD8' },
} as const;

export const FONT_SANS = 'Manrope, ui-sans-serif, system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

export function baseLayout(theme: Theme): Partial<Layout> {
  const c = CHART_INK[theme];
  const axis = {
    gridcolor: c.grid,
    zerolinecolor: c.zero,
    linecolor: c.line,
    tickfont: { family: FONT_MONO, size: 10.5, color: c.ink3 },
    title: { font: { family: FONT_SANS, size: 11.5, color: c.ink2 } },
    automargin: true,
  };
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: FONT_SANS, size: 12, color: c.ink2 },
    margin: { l: 56, r: 16, t: 28, b: 40 },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: c.panel,
      bordercolor: c.line,
      font: { family: FONT_MONO, size: 11.5, color: c.ink },
    },
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.02,
      yanchor: 'bottom',
      xanchor: 'left',
      font: { size: 11, color: c.ink2 },
      bgcolor: 'rgba(0,0,0,0)',
    },
    xaxis: { ...axis },
    yaxis: { ...axis },
    separators: '.,',
  } as Partial<Layout>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep merge for layout objects (arrays replaced). */
export function mergeLayout(a: Partial<Layout>, b: Partial<Layout>): Partial<Layout> {
  const out: Obj = { ...(a as Obj) };
  for (const [k, v] of Object.entries(b as Obj)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isObj(cur) && isObj(v) ? mergeLayout(cur as Partial<Layout>, v as Partial<Layout>) : v;
  }
  return out as Partial<Layout>;
}

/** Plotly has no timezone support; strip the "Z" and render the axis explicitly labelled as UTC. */
export function toPlotTime(iso: string): string {
  return iso.replace('T', ' ').replace(/Z$|\+00:00$/, '');
}

export const RANGE_BUTTONS: { buttons: Partial<RangeSelectorButton>[] } = {
  buttons: [
    { count: 1, label: '1d', step: 'day', stepmode: 'backward' },
    { count: 3, label: '3d', step: 'day', stepmode: 'backward' },
    { count: 7, label: '1w', step: 'day', stepmode: 'backward' },
    { step: 'all', label: 'all' },
  ],
};

/**
 * Parse a plotly_relayout event into an x-range change.
 * Returns undefined if the event does not touch the x-axis, null for autorange.
 */
export function extractXRange(e: Record<string, unknown>): [string, string] | null | undefined {
  if (e['xaxis.autorange'] === true || e['autosize'] === true) return e['xaxis.autorange'] ? null : undefined;
  const r0 = e['xaxis.range[0]'];
  const r1 = e['xaxis.range[1]'];
  if (r0 !== undefined && r1 !== undefined) return [String(r0), String(r1)];
  const arr = e['xaxis.range'];
  if (Array.isArray(arr) && arr.length === 2) return [String(arr[0]), String(arr[1])];
  return undefined;
}
