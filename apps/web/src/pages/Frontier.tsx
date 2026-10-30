import { useMemo, useState } from 'react';
import type { Data, Layout } from 'plotly.js';
import { GitCompareArrows, MousePointerClick, X } from 'lucide-react';
import { useExperiment } from '../api/hooks';
import { REFERENCE_IDS, type FrontierPayload, type FrontierStrategy } from '../api/types';
import { Plot } from '../components/charts/Plot';
import { Heatmap } from '../components/frontier/Heatmap';
import { MarginalPanel } from '../components/frontier/MarginalPanel';
import { FAMILY_LABEL, familyTech, metricDef, metricsFor, val, type MetricKey } from '../components/frontier/metrics';
import { RefGate } from '../components/frontier/RefGate';
import { ChronoCheckPanel } from '../components/frontier/ValidationPanels';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Callout, Drawer } from '../components/ui/feedback';
import { Badge, Button, Panel, Segmented, Select, StatList } from '../components/ui/primitives';
import { DataLabel, DataTable, DownloadButtons, RunTag } from '../components/ui/run';
import { alpha, palette } from '../lib/colors';
import { DASH, fmtDelta, fmtMEUR, fmtMEURyr, fmtMW, fmtMWh, fmtNum, isNum, scenarioLabel } from '../lib/format';
import { paretoFront } from '../lib/pareto';
import { useTheme } from '../state/theme';

type YKey = 'imports_mwh' | 'ens_mwh' | 'cvar_total_keur_annualised';

/** Payload Pareto flag for each (expected-view) y axis; x is always expected total annualised cost. */
const PAYLOAD_FLAG: Record<YKey, 'pareto' | 'pareto_cost_ens' | 'pareto_cost_cvar'> = {
  imports_mwh: 'pareto',
  ens_mwh: 'pareto_cost_ens',
  cvar_total_keur_annualised: 'pareto_cost_cvar',
};
const Y_LABEL: Record<YKey, string> = { imports_mwh: 'imports', ens_mwh: 'unserved energy', cvar_total_keur_annualised: 'CVaR₀.₉ of total cost' };

/* ---------------- scatter ---------------- */
function FrontierScatter({
  strategies,
  view,
  yKey,
  frontIds,
  selected,
  onPick,
}: {
  strategies: FrontierStrategy[];
  view: string;
  yKey: YKey;
  frontIds: Set<string>;
  selected: string[];
  onPick: (id: string) => void;
}) {
  const { theme } = useTheme();
  const p = palette(theme);
  const xDef = metricDef('total_cost_keur_annualised');
  const yDef = metricDef(yKey, strategies.map((s) => val(metricsFor(s, view), yKey)));
  const ring = theme === 'dark' ? '#060b14' : '#ffffff';

  const data = useMemo<Data[]>(() => {
    const pts = strategies
      .map((s) => {
        const m = metricsFor(s, view);
        const x = val(m, 'total_cost_keur_annualised');
        const y = val(m, yKey);
        return isNum(x) && isNum(y) ? { s, x: xDef.scale(x), y: yDef.scale(y) } : null;
      })
      .filter((v): v is { s: FrontierStrategy; x: number; y: number } => v !== null);
    const families = [...new Set(pts.map((q) => q.s.family))];
    const traces: Data[] = [];
    const front = pts.filter((q) => frontIds.has(q.s.id)).sort((a, b) => a.x - b.x);
    if (front.length > 1)
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Non-dominated front',
        x: front.map((q) => q.x),
        y: front.map((q) => q.y),
        line: { color: p.hydro, width: 2, shape: 'hv' },
        hoverinfo: 'skip',
      });
    families.forEach((f) => {
      const fp = pts.filter((q) => q.s.family === f);
      const c = p[familyTech(f)];
      traces.push({
        type: 'scatter',
        mode: 'text+markers',
        name: FAMILY_LABEL[f] ?? f,
        x: fp.map((q) => q.x),
        y: fp.map((q) => q.y),
        text: fp.map((q) => (frontIds.has(q.s.id) || selected.includes(q.s.id) ? q.s.name : '')),
        textposition: 'top right',
        textfont: { size: 10, color: theme === 'dark' ? '#a9b6ca' : '#39475d' },
        customdata: fp.map((q) => q.s.id),
        marker: {
          size: fp.map((q) => (selected.includes(q.s.id) ? 17 : frontIds.has(q.s.id) ? 13 : 10)),
          color: fp.map((q) => (frontIds.has(q.s.id) ? c : alpha(c, 0.25))),
          line: { color: fp.map((q) => (selected.includes(q.s.id) ? p.money : frontIds.has(q.s.id) ? ring : c)), width: fp.map((q) => (selected.includes(q.s.id) ? 3 : 1.5)) },
        },
        hovertemplate: fp.map(
          (q) =>
            `<b>${q.s.name}</b>${frontIds.has(q.s.id) ? ' · non-dominated' : ''}<br>` +
            `${xDef.label}: %{x:,.${xDef.digits}f} ${xDef.unit}<br>${yDef.label}: %{y:,.${yDef.digits}f} ${yDef.unit}<br>` +
            `Capex: ${fmtMEUR(isNum(q.s.capex_overnight_meur) ? q.s.capex_overnight_meur * 1000 : null)} overnight<extra>${FAMILY_LABEL[f] ?? f}</extra>`,
        ),
      } as Data);
    });
    return traces;
  }, [strategies, view, yKey, frontIds, selected, p, theme, ring, xDef, yDef]);

  const layout = useMemo<Partial<Layout>>(
    () => ({
      hovermode: 'closest',
      xaxis: { title: { text: `${view === 'expected' ? 'Expected' : scenarioLabel(view)} total annualised cost (${xDef.unit})` }, tickformat: ',.0f', zeroline: false },
      yaxis: { title: { text: yKey === 'cvar_total_keur_annualised' ? `${yDef.label} (${yDef.unit})` : `${view === 'expected' ? 'Expected' : scenarioLabel(view)} ${yDef.label.toLowerCase()} (${yDef.unit})` }, tickformat: ',.1f', rangemode: yKey === 'cvar_total_keur_annualised' ? 'normal' : 'tozero' },
      legend: { y: 1.04 },
      margin: { t: 48 },
    }),
    [view, xDef, yDef, yKey],
  );
  return (
    <Plot
      data={data}
      layout={layout}
      height={460}
      ariaLabel="Investment strategies: annualised cost versus imports or energy not served, non-dominated front connected"
      filename="hydroflex-frontier"
      onClick={(pts) => {
        const id = pts[0]?.customdata;
        if (typeof id === 'string') onPick(id);
      }}
    />
  );
}

/* ---------------- strategy detail ---------------- */
function StrategyDetail({ s, scenarios }: { s: FrontierStrategy; scenarios: string[] }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const add = s.additions;
  const powerData = useMemo<Data[]>(
    () => [
      {
        type: 'bar',
        x: ['Solar PV', 'Wind', 'Battery power'],
        y: [add.pv, add.wind, add.bp],
        marker: { color: [p.solar, p.wind, p.battery] },
        hovertemplate: '%{x}: %{y:,.0f} MW<extra></extra>',
        width: 0.5,
      },
    ],
    [add, p],
  );
  const costData = useMemo<Data[]>(
    () => [
      {
        type: 'bar',
        x: scenarios.map(scenarioLabel),
        y: scenarios.map((k) => {
          const v = s.by_scenario?.[k]?.total_cost_keur_annualised;
          return isNum(v) ? v / 1000 : null;
        }),
        marker: { color: p.money },
        width: 0.5,
        hovertemplate: '%{x}: %{y:,.1f} M€/yr<extra></extra>',
      },
    ],
    [s, scenarios, p],
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{FAMILY_LABEL[s.family] ?? s.family}</Badge>
        {s.pareto && <Badge tone="hydro">non-dominated (payload front)</Badge>}
      </div>
      {s.description && <p className="text-sm leading-relaxed text-ink-2">{s.description}</p>}
      <div>
        <h3 className="eyebrow mb-2">Capacity additions</h3>
        <StatList
          items={[
            { label: 'Solar PV', value: fmtMW(add.pv) },
            { label: 'Wind', value: fmtMW(add.wind) },
            { label: 'Battery power', value: fmtMW(add.bp) },
            { label: 'Battery energy', value: fmtMWh(add.be) },
            { label: 'Overnight capex', value: isNum(s.capex_overnight_meur) ? `${fmtNum(s.capex_overnight_meur, 1)} M€` : DASH },
            { label: 'Annualised capex', value: fmtMEURyr(s.capex_annualised_keur) },
          ]}
        />
        <Plot data={powerData} layout={{ hovermode: 'closest', yaxis: { title: { text: 'MW added' }, rangemode: 'tozero' }, margin: { t: 12 } }} height={200} ariaLabel="Power capacity additions by technology" filename={`${s.id}-additions`} />
        <p className="text-[0.7rem] text-ink-3">Battery energy ({fmtMWh(add.be)}) is shown in the table: MWh cannot share the MW axis. The payload reports total capex only; no per-technology capex split is available.</p>
      </div>
      <div>
        <h3 className="eyebrow mb-2">Annualised total cost by drought scenario</h3>
        <Plot data={costData} layout={{ hovermode: 'closest', yaxis: { title: { text: 'M€/yr' }, tickformat: ',.0f' }, margin: { t: 12 } }} height={220} ariaLabel="Annualised total cost of this strategy under each evaluation scenario" filename={`${s.id}-by-scenario`} />
      </div>
      <DataTable
        dense
        caption="Strategy metrics by scenario"
        rows={['expected', ...scenarios]}
        rowKey={(k) => k}
        columns={[
          { key: 'sc', header: 'Scenario', cell: (k) => (k === 'expected' ? <strong>Expected</strong> : scenarioLabel(k)) },
          { key: 'c', header: 'Cost M€/yr', align: 'right', cell: (k) => fmtNum((metricsFor(s, k)?.total_cost_keur_annualised ?? NaN) / 1000, 1) },
          { key: 'i', header: 'Imports GWh', align: 'right', cell: (k) => fmtNum((metricsFor(s, k)?.imports_mwh ?? NaN) / 1000, 1) },
          { key: 'e', header: 'ENS MWh', align: 'right', cell: (k) => fmtNum(metricsFor(s, k)?.ens_mwh, 0) },
          { key: 'l', header: 'LOL h', align: 'right', cell: (k) => fmtNum(metricsFor(s, k)?.lol_hours, 0) },
        ]}
      />
    </div>
  );
}

/* ---------------- compare ---------------- */
function CompareTable({ a, b, scenarios, onClear }: { a: FrontierStrategy; b: FrontierStrategy; scenarios: string[]; onClear: () => void }) {
  type Row = { label: string; va: number | null; vb: number | null; digits: number; unit: string };
  const mv = (s: FrontierStrategy, view: string, k: MetricKey, div = 1) => {
    const v = val(metricsFor(s, view), k);
    return isNum(v) ? v / div : null;
  };
  const rows: Row[] = [
    { label: 'Solar PV added', va: a.additions.pv, vb: b.additions.pv, digits: 0, unit: 'MW' },
    { label: 'Wind added', va: a.additions.wind, vb: b.additions.wind, digits: 0, unit: 'MW' },
    { label: 'Battery power added', va: a.additions.bp, vb: b.additions.bp, digits: 0, unit: 'MW' },
    { label: 'Battery energy added', va: a.additions.be, vb: b.additions.be, digits: 0, unit: 'MWh' },
    { label: 'Overnight capex', va: a.capex_overnight_meur, vb: b.capex_overnight_meur, digits: 1, unit: 'M€' },
    { label: 'Expected cost', va: mv(a, 'expected', 'total_cost_keur_annualised', 1000), vb: mv(b, 'expected', 'total_cost_keur_annualised', 1000), digits: 1, unit: 'M€/yr' },
    { label: 'Expected imports', va: mv(a, 'expected', 'imports_mwh', 1000), vb: mv(b, 'expected', 'imports_mwh', 1000), digits: 1, unit: 'GWh/yr' },
    { label: 'Expected ENS', va: mv(a, 'expected', 'ens_mwh'), vb: mv(b, 'expected', 'ens_mwh'), digits: 0, unit: 'MWh/yr' },
    ...scenarios.map((k) => ({ label: `Cost · ${scenarioLabel(k)}`, va: mv(a, k, 'total_cost_keur_annualised', 1000), vb: mv(b, k, 'total_cost_keur_annualised', 1000), digits: 1, unit: 'M€/yr' })),
    ...scenarios.map((k) => ({ label: `ENS · ${scenarioLabel(k)}`, va: mv(a, k, 'ens_mwh'), vb: mv(b, k, 'ens_mwh'), digits: 0, unit: 'MWh' })),
  ];
  return (
    <Panel
      eyebrow="Compare strategies"
      title={`${a.name}  vs  ${b.name}`}
      actions={
        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onClear}>
          Clear
        </Button>
      }
    >
      <DataTable
        dense
        caption="Side-by-side strategy comparison"
        rows={rows}
        rowKey={(r) => r.label}
        columns={[
          { key: 'm', header: 'Metric', cell: (r) => r.label },
          { key: 'a', header: a.name, align: 'right', cell: (r) => (isNum(r.va) ? `${fmtNum(r.va, r.digits)} ${r.unit}` : DASH) },
          { key: 'b', header: b.name, align: 'right', cell: (r) => (isNum(r.vb) ? `${fmtNum(r.vb, r.digits)} ${r.unit}` : DASH) },
          { key: 'd', header: 'Δ (B − A)', align: 'right', cell: (r) => (isNum(r.va) && isNum(r.vb) ? fmtDelta(r.vb - r.va, r.digits, r.unit) : DASH) },
        ]}
      />
    </Panel>
  );
}

/* ---------------- page body ---------------- */
const HEAT_METRICS: { value: MetricKey; label: string }[] = [
  { value: 'total_cost_keur_annualised', label: 'Total annualised cost' },
  { value: 'ens_mwh', label: 'Energy not served' },
  { value: 'imports_mwh', label: 'Imports' },
  { value: 'lol_hours', label: 'Loss-of-load hours' },
  { value: 'curtailment_share', label: 'Curtailment share' },
];

function FrontierBody({ d }: { d: FrontierPayload }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const scenarios = d.evaluation_scenarios ?? [];
  const [view, setView] = useState<string>('expected');
  const [yKey, setYKey] = useState<YKey>('imports_mwh');
  const [compare, setCompare] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [heatMetric, setHeatMetric] = useState<MetricKey>('total_cost_keur_annualised');
  const byId = useMemo(() => new Map(d.strategies.map((s) => [s.id, s])), [d.strategies]);

  const flag = PAYLOAD_FLAG[yKey];
  const payloadHasFlag = flag === 'pareto' || !!d.pareto_fronts?.[flag] || d.strategies.some((s) => typeof s[flag] === 'boolean');
  const usePayloadFront = view === 'expected' && payloadHasFlag;
  const frontIds = useMemo(() => {
    if (usePayloadFront) {
      const ids = new Set(d.pareto_fronts?.[flag] ?? (flag === 'pareto' ? (d.pareto_front ?? []) : []));
      d.strategies.forEach((s) => s[flag] === true && ids.add(s.id));
      return ids;
    }
    const front = paretoFront(d.strategies.map((s) => ({ item: s, objectives: [val(metricsFor(s, view), 'total_cost_keur_annualised'), val(metricsFor(s, view), yKey)] })));
    return new Set(front.map((f) => f.item.id));
  }, [d, view, yKey, usePayloadFront, flag]);

  const onPick = (id: string) => {
    if (!compare) return setDetail(id);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.slice(-1), id]));
  };

  const heatDef = metricDef(heatMetric, d.strategies.flatMap((s) => scenarios.map((k) => val(s.by_scenario?.[k], heatMetric))));
  const heatZ = d.strategies.map((s) =>
    scenarios.map((k) => {
      const v = val(s.by_scenario?.[k], heatMetric);
      return isNum(v) ? heatDef.scale(v) : null;
    }),
  );
  const heatColor = heatMetric === 'total_cost_keur_annualised' ? p.money : heatMetric === 'imports_mwh' ? p.imports : heatMetric === 'curtailment_share' ? p.curtailment : p.unserved;
  const det = detail ? byId.get(detail) : undefined;
  const pa = picked[0] ? byId.get(picked[0]) : undefined;
  const pb = picked[1] ? byId.get(picked[1]) : undefined;
  const frontNames = d.strategies.filter((s) => frontIds.has(s.id)).map((s) => s.name);

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          eyebrow={`${d.strategies.length} strategies · ${scenarios.length} evaluation scenarios`}
          title="Cost–security frontier"
          actions={
            <>
              <Segmented
                label="Y axis"
                size="sm"
                value={yKey}
                onChange={(k) => {
                  setYKey(k);
                  if (k === 'cvar_total_keur_annualised') setView('expected');
                }}
                options={[
                  { value: 'imports_mwh', label: 'Imports' },
                  { value: 'ens_mwh', label: 'Unserved energy' },
                  { value: 'cvar_total_keur_annualised', label: 'CVaR₀.₉ of total cost', title: 'Expected view only: CVaR(0.9) across evaluation scenarios' },
                ]}
              />
              <Select
                label="View"
                hideLabel
                value={view}
                onChange={setView}
                options={[{ value: 'expected', label: 'Expected (probability-weighted)' }, ...(yKey === 'cvar_total_keur_annualised' ? [] : scenarios.map((k) => ({ value: k, label: `Scenario: ${scenarioLabel(k)}` })))]}
              />
              <Button
                size="sm"
                variant={compare ? 'primary' : 'secondary'}
                aria-pressed={compare}
                icon={<GitCompareArrows size={13} />}
                onClick={() => {
                  setCompare((c) => !c);
                  setPicked([]);
                }}
              >
                Compare two
              </Button>
            </>
          }
        >
          <FrontierScatter strategies={d.strategies} view={view} yKey={yKey} frontIds={frontIds} selected={compare ? picked : detail ? [detail] : []} onPick={onPick} />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <MousePointerClick size={13} aria-hidden />
            {compare ? `Compare mode: click two strategies (${picked.length}/2 selected).` : 'Click a strategy for its capacity additions and per-scenario costs.'}
          </div>
          <Callout tone={usePayloadFront ? 'info' : 'uncertainty'} className="mt-3" title={usePayloadFront ? 'Front from the experiment payload' : 'Front computed in the browser'}>
            {usePayloadFront
              ? `Highlighted points carry ${flag} = true in ref-H-frontier${d.pareto_definitions?.[flag] ? ` (${d.pareto_definitions[flag]})` : ` (minimise expected cost and ${Y_LABEL[yKey]})`}.`
              : `For ${view === 'expected' ? 'expected values' : scenarioLabel(view)} with “${Y_LABEL[yKey]}”, the non-dominated set is recomputed client-side (a point is dominated if another is no worse on both axes and strictly better on one).`}{' '}
            The front is computed only from the {d.strategies.length} evaluated strategies, not from a continuous optimisation over all portfolios; a single strategy dominating most others is a genuine result of these assumptions.{' '}
            Non-dominated: {frontNames.length ? frontNames.join(', ') : 'none'}.
          </Callout>
        </Panel>

        <Panel title="Strategies" eyebrow="Expected values">
          <ul className="scrollbar-thin max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {[...d.strategies]
              .sort((a, b) => (val(a.expected, 'total_cost_keur_annualised') ?? Infinity) - (val(b.expected, 'total_cost_keur_annualised') ?? Infinity))
              .map((s) => {
                const on = frontIds.has(s.id);
                const sel = compare ? picked.includes(s.id) : detail === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onPick(s.id)}
                      aria-pressed={sel}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${sel ? 'border-[var(--money)] bg-panel-3' : 'border-line hover:border-line-strong hover:bg-panel-2'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: on ? p[familyTech(s.family)] : 'transparent', border: `1.5px solid ${p[familyTech(s.family)]}` }} aria-hidden />
                          <span className="truncate text-sm font-medium text-ink">{s.name}</span>
                        </span>
                        {on && <span className="num text-[0.62rem] text-hydro">FRONT</span>}
                      </div>
                      <div className="num mt-1 flex justify-between text-[0.7rem] text-ink-3">
                        <span>{fmtMEURyr(s.expected?.total_cost_keur_annualised)}</span>
                        <span>{fmtNum((s.expected?.imports_mwh ?? NaN) / 1000, 0)} GWh imp.</span>
                        <span>{fmtNum(s.expected?.ens_mwh, 0)} MWh ENS</span>
                      </div>
                    </button>
                  </li>
                );
              })}
          </ul>
        </Panel>
      </div>

      {compare && pa && pb && <CompareTable a={pa} b={pb} scenarios={scenarios} onClear={() => setPicked([])} />}

      <Panel
        eyebrow="Strategy × drought scenario"
        title="How each strategy performs under each scenario"
        actions={<Select label="Metric" hideLabel value={heatMetric} onChange={setHeatMetric} options={HEAT_METRICS} />}
      >
        {scenarios.length ? (
          <Heatmap
            x={scenarios.map(scenarioLabel)}
            y={d.strategies.map((s) => s.name)}
            z={heatZ}
            color={heatColor}
            unit={heatDef.unit}
            digits={heatDef.digits}
            xTitle="Evaluation scenario"
            ariaLabel={`${heatDef.label} of each strategy under each evaluation scenario`}
            filename={`frontier-heatmap-${heatMetric}`}
          />
        ) : (
          <p className="text-sm text-ink-3">The payload lists no evaluation scenarios.</p>
        )}
        <p className="mt-2 text-[0.7rem] text-ink-3">Darker = higher {heatDef.label.toLowerCase()} ({heatDef.unit}). Each strategy’s first-stage capacities are fixed and re-dispatched under every scenario.</p>
      </Panel>

      <Drawer open={!!det} onClose={() => setDetail(null)} title={det?.name ?? 'Strategy'} width={500}>
        {det && <StrategyDetail s={det} scenarios={scenarios} />}
      </Drawer>
    </>
  );
}

export default function Frontier() {
  const state = useExperiment<FrontierPayload>(REFERENCE_IDS.frontier);
  const d = state.data;
  return (
    <Page>
      <PageHeader
        eyebrow="Investment Frontier"
        title="Which portfolios buy the most security per euro?"
        lead="Candidate investment strategies — solar, wind, batteries and coordinated portfolios — re-evaluated under normal and drought conditions. Points on the non-dominated front cannot reduce imports (or unserved energy) without raising annualised system cost."
        meta={
          d ? (
            <>
              <RunTag run={{ ...d, reference: d.reference ?? true }} />
              <Badge tone="neutral">{d.frontier_axes?.x ?? 'expected total annualised cost'}</Badge>
            </>
          ) : undefined
        }
        actions={d ? <DownloadButtons runId={d.run_id} formats={['json']} /> : undefined}
      />
      <RefGate id={REFERENCE_IDS.frontier} state={state} height={460}>
        {(data) => <FrontierBody d={data} />}
      </RefGate>
      <MarginalPanel />
      <ChronoCheckPanel compact />
      <DataLabel label={d?.data_label} />
    </Page>
  );
}
