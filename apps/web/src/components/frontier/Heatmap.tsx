import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { alpha } from '../../lib/colors';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';
import { CHART_INK, FONT_MONO } from '../charts/plotTheme';

/**
 * Sequential single-hue heatmap (light → saturated = low → high). Cells show their value as text,
 * so the colour is never the only carrier of information. Null cells stay blank.
 */
export function Heatmap({
  x,
  y,
  z,
  color,
  unit,
  digits = 1,
  xTitle,
  yTitle,
  ariaLabel,
  filename,
  height,
}: {
  x: string[];
  y: string[];
  z: (number | null)[][];
  color: string;
  unit: string;
  digits?: number;
  xTitle?: string;
  yTitle?: string;
  ariaLabel: string;
  filename: string;
  height?: number;
}) {
  const { theme } = useTheme();
  const ink = CHART_INK[theme];
  const data = useMemo<Data[]>(
    () => [
      {
        type: 'heatmap',
        x,
        y,
        z,
        colorscale: [
          [0, alpha(color, theme === 'dark' ? 0.06 : 0.05)],
          [1, alpha(color, 0.95)],
        ],
        xgap: 2,
        ygap: 2,
        hoverongaps: false,
        text: z.map((row) => row.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : ''))),
        texttemplate: '%{text}',
        textfont: { family: FONT_MONO, size: 10.5, color: ink.ink },
        hovertemplate: `%{y} · %{x}<br>%{z:,.${digits}f} ${unit}<extra></extra>`,
        colorbar: { title: { text: unit, side: 'right' }, thickness: 10, outlinewidth: 0, tickfont: { family: FONT_MONO, size: 10, color: ink.ink3 } },
      } as unknown as Data,
    ],
    [x, y, z, color, unit, digits, theme, ink],
  );
  const layout = useMemo<Partial<Layout>>(
    () => ({
      hovermode: 'closest',
      xaxis: { type: 'category', title: { text: xTitle ?? '' }, showgrid: false, side: 'bottom' },
      yaxis: { type: 'category', title: { text: yTitle ?? '' }, showgrid: false, autorange: 'reversed' },
      margin: { l: 150, r: 20, t: 16, b: 56 },
    }),
    [xTitle, yTitle],
  );
  return <Plot data={data} layout={layout} height={height ?? Math.max(220, 46 + y.length * 34)} ariaLabel={ariaLabel} filename={filename} />;
}
