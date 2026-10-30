import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import type { FrontierPayload } from '../../api/types';
import { alpha, palette } from '../../lib/colors';
import { isNum } from '../../lib/format';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';

/** Expected annualised cost vs expected imports for every evaluated strategy; Pareto points from the payload flags. */
export function FrontierMini({ frontier, height = 380 }: { frontier: FrontierPayload; height?: number }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const data = useMemo<Data[]>(() => {
    const pts = frontier.strategies.filter((s) => isNum(s.expected?.total_cost_keur_annualised) && isNum(s.expected?.imports_mwh));
    const front = new Set(frontier.pareto_front?.length ? frontier.pareto_front : pts.filter((s) => s.pareto).map((s) => s.id));
    const pf = pts.filter((s) => front.has(s.id)).sort((a, b) => (a.expected.total_cost_keur_annualised as number) - (b.expected.total_cost_keur_annualised as number));
    const other = pts.filter((s) => !front.has(s.id));
    const x = (s: (typeof pts)[number]) => (s.expected.total_cost_keur_annualised as number) / 1000;
    const y = (s: (typeof pts)[number]) => (s.expected.imports_mwh as number) / 1000;
    return [
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Dominated strategy',
        x: other.map(x),
        y: other.map(y),
        text: other.map((s) => s.name),
        marker: { size: 10, color: alpha(p.imports, 0.55), line: { width: 1, color: p.imports } },
        hovertemplate: '%{text}<br>%{x:,.1f} M€/yr · %{y:,.0f} GWh/yr<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'text+lines+markers',
        name: 'Pareto front (non-dominated)',
        x: pf.map(x),
        y: pf.map(y),
        text: pf.map((s) => s.name),
        textposition: 'top right',
        textfont: { size: 10, color: p.demand },
        marker: { size: 12, color: p.wind, line: { width: 2, color: theme === 'dark' ? '#060B14' : '#fff' } },
        line: { color: p.wind, width: 2 },
        hovertemplate: '%{text}<br>%{x:,.1f} M€/yr · %{y:,.0f} GWh/yr<extra>Pareto</extra>',
      },
    ];
  }, [frontier, p, theme]);
  const layout = useMemo<Partial<Layout>>(
    () => ({
      hovermode: 'closest',
      xaxis: { title: { text: 'Expected total annualised cost (M€/yr)' }, tickformat: ',.0f' },
      yaxis: { title: { text: 'Expected imports (GWh/yr)' }, tickformat: ',.0f' },
    }),
    [],
  );
  return <Plot data={data} layout={layout} height={height} ariaLabel="Investment frontier: expected cost versus expected imports for each strategy" filename="hydroflex-frontier" />;
}
