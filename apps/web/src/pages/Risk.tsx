import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import { ShieldCheck } from 'lucide-react';
import { useExperiment } from '../api/hooks';
import { REFERENCE_IDS, type Explanation, type FrontierPayload, type RunPayload, type ScenarioMetrics, type SensitivityPayload } from '../api/types';
import { Plot } from '../components/charts/Plot';
import { RefGate } from '../components/frontier/RefGate';
import { DroughtSweep, RegretMatrix, SensitivityHeatmap, TornadoChart } from '../components/risk/SensitivityPanels';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Callout } from '../components/ui/feedback';
import { Badge, EmptyState, Kpi, Panel } from '../components/ui/primitives';
import { DataLabel, DataTable, DownloadButtons, Explanations, RunTag } from '../components/ui/run';
import { palette, scenarioColor } from '../lib/colors';
import { DASH, fmtDelta, fmtMW, fmtMWh, fmtNum, fmtPct, isNum, meurParts, scenarioLabel, type Maybe } from '../lib/format';
import { useTheme } from '../state/theme';

/** Prefer the annualised figure (M€/yr); otherwise the per-horizon value with an explicit label. */
function money(annual: Maybe, horizon: Maybe): { value: string; unit: string; basis: 'annual' | 'horizon' } {
  if (isNum(annual)) return { value: meurParts(annual).value, unit: 'M€/yr', basis: 'annual' };
  return { value: meurParts(horizon).value, unit: 'M€ per modelled horizon', basis: 'horizon' };
}

function Explainer() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-line p-4">
        <div className="eyebrow mb-1">Deterministic planning</div>
        <h3 className="font-serif text-lg text-ink">Plan for one forecast</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          Capacities are optimised against a single expected-value year. The resulting plan (the <em>EEV</em> plan when it is then re-evaluated under every scenario) can be cheap on average yet fragile in dry
          years, because the optimiser never “saw” a drought.
        </p>
      </div>
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--uncertainty)_40%,transparent)] p-4">
        <div className="eyebrow mb-1 text-uncertainty">Two-stage stochastic planning</div>
        <h3 className="font-serif text-lg text-ink">One plan, many possible years</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          First-stage capacities are shared by all scenarios; each scenario then re-dispatches optimally. The objective weighs scenarios by probability and, with λ &gt; 0, adds the CVaR of the worst (1 − α) tail.
          <strong className="text-ink"> VSS</strong> = EEV − RP on the risk-adjusted objective (expected cost + λ·CVaR), so it is never negative. The <strong className="text-ink">price of risk aversion</strong> is RP − EEV on expected cost alone: what the hedge costs on an average year. <strong className="text-ink">EVPI</strong> (RP − wait-and-see) is only defined for a risk-neutral objective (λ = 0).
        </p>
      </div>
    </div>
  );
}

function ProbabilityChart({ scen }: { scen: ScenarioMetrics[] }) {
  const { theme } = useTheme();
  const data = useMemo<Data[]>(
    () => [
      {
        type: 'bar',
        x: scen.map((s) => s.label || scenarioLabel(s.key)),
        y: scen.map((s) => (isNum(s.probability) ? s.probability * 100 : null)),
        marker: { color: scen.map((s) => scenarioColor(s.key, theme)) },
        width: 0.55,
        text: scen.map((s) => (isNum(s.probability) ? `${(s.probability * 100).toFixed(1)} %` : '')),
        textposition: 'outside',
        hovertemplate: '%{x}: %{y:.1f} %<extra></extra>',
      },
    ],
    [scen, theme],
  );
  return <Plot data={data} layout={{ hovermode: 'closest', yaxis: { title: { text: 'Probability (%)' }, rangemode: 'tozero', ticksuffix: '%' }, margin: { t: 16 } }} height={250} ariaLabel="Scenario probabilities" filename="stochastic-probabilities" />;
}

function LossDistribution({ run }: { run: RunPayload }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const annualBasis = run.horizon?.metrics_basis === 'annualised';
  const r = run.risk;
  const useAnnual = isNum(r?.var_keur_annualised) || isNum(r?.cvar_keur_annualised);
  const alphaTxt = isNum(r?.alpha) ? ` (α = ${r?.alpha})` : '';
  const unit = useAnnual ? 'M€/yr' : 'M€ (modelled horizon)';
  const data = useMemo<Data[]>(() => {
    const loss = (s: ScenarioMetrics) => (useAnnual ? (s.opex_keur_annualised ?? (annualBasis ? s.opex_keur : null)) : s.opex_keur);
    const markers = [
      { name: 'Expected loss', v: useAnnual ? r?.expected_loss_keur_annualised : r?.expected_loss_keur, color: p.hydro, dash: 'dot' as const },
      { name: `VaR${alphaTxt}`, v: useAnnual ? r?.var_keur_annualised : r?.var_keur, color: p.money, dash: 'dash' as const },
      { name: `CVaR${alphaTxt}`, v: useAnnual ? r?.cvar_keur_annualised : r?.cvar_keur, color: p.unserved, dash: 'solid' as const },
    ];
    const sorted = [...run.scenarios].sort((a, b) => (loss(a) ?? 0) - (loss(b) ?? 0));
    const y = sorted.map((s) => s.label || scenarioLabel(s.key));
    const xs = sorted.map((s) => {
      const v = loss(s);
      return isNum(v) ? v / 1000 : null;
    });
    const stems: Data[] = sorted.map((s, i) => ({
      type: 'scatter',
      mode: 'lines',
      x: [0, xs[i]],
      y: [y[i], y[i]],
      line: { color: scenarioColor(s.key, theme), width: 2 },
      hoverinfo: 'skip',
      showlegend: false,
    }));
    return [
      ...stems,
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Scenario operating cost L_s',
        x: xs,
        y,
        customdata: sorted.map((s) => (isNum(s.probability) ? s.probability * 100 : null)),
        marker: { size: 13, color: sorted.map((s) => scenarioColor(s.key, theme)), line: { color: theme === 'dark' ? '#060b14' : '#fff', width: 2 } },
        hovertemplate: `%{y}<br>L_s = %{x:,.1f} ${unit}<br>p = %{customdata:.1f} %<extra></extra>`,
      },
      ...markers
        .filter((m) => isNum(m.v))
        .map(
          (m) =>
            ({
              type: 'scatter',
              mode: 'lines',
              name: `${m.name}: ${fmtNum((m.v as number) / 1000, 1)} ${unit}`,
              x: [(m.v as number) / 1000, (m.v as number) / 1000],
              y: [y[0], y[y.length - 1]],
              line: { color: m.color, width: 1.6, dash: m.dash },
              hovertemplate: `${m.name}: %{x:,.1f} ${unit}<extra></extra>`,
            }) as Data,
        ),
    ];
  }, [run, theme, p, unit, useAnnual, annualBasis, r, alphaTxt]);
  const layout = useMemo<Partial<Layout>>(
    () => ({ hovermode: 'closest', xaxis: { title: { text: `Operating cost L_s (${unit})` }, tickformat: ',.0f', zeroline: true }, yaxis: { type: 'category', automargin: true }, legend: { y: 1.08 }, margin: { l: 120, t: 48 } }),
    [unit],
  );
  return (
    <>
      <Plot data={data} layout={layout} height={Math.max(260, 110 + run.scenarios.length * 40)} ariaLabel="Scenario operating cost distribution with expected loss, VaR and CVaR" filename="stochastic-loss-distribution" />
      <p className="mt-1 text-[0.7rem] text-ink-3">
        L_s is the scenario operating cost on which CVaR is defined (imports − export revenue + VOLL·unserved + hydro O&amp;M + battery degradation). Values {useAnnual ? 'annualised' : 'per modelled horizon'}; VaR/CVaR from the payload’s risk block.
      </p>
    </>
  );
}

const PLAN_ROWS = [
  { k: 'pv', label: 'Solar PV', unit: 'MW' },
  { k: 'wind', label: 'Wind', unit: 'MW' },
  { k: 'bp', label: 'Battery power', unit: 'MW' },
  { k: 'be', label: 'Battery energy', unit: 'MWh' },
] as const;

function PlanComparison({ run }: { run: RunPayload }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const dc = run.deterministic_comparison;
  const det = dc?.deterministic_plan_additions ?? {};
  const rows = PLAN_ROWS;
  const data = useMemo<Data[]>(() => {
    const mw = PLAN_ROWS.filter((r) => r.unit === 'MW');
    const d0 = run.deterministic_comparison?.deterministic_plan_additions ?? {};
    return [
      { type: 'bar', name: 'Stochastic plan (RP)', x: mw.map((r) => r.label), y: mw.map((r) => run.additions?.[r.k] ?? null), marker: { color: p.uncertainty }, hovertemplate: '%{x}: %{y:,.0f} MW<extra>Stochastic</extra>' },
      { type: 'bar', name: 'Deterministic plan (EV)', x: mw.map((r) => r.label), y: mw.map((r) => d0[r.k] ?? null), marker: { color: p.imports }, hovertemplate: '%{x}: %{y:,.0f} MW<extra>Deterministic</extra>' },
    ] as Data[];
  }, [run, p]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Plot data={data} layout={{ barmode: 'group', hovermode: 'closest', yaxis: { title: { text: 'MW added' }, rangemode: 'tozero', tickformat: ',.0f' }, legend: { y: 1.1 }, margin: { t: 40 } }} height={260} ariaLabel="Capacity additions of the stochastic versus deterministic plan" filename="stochastic-vs-deterministic-plan" />
      <DataTable
        dense
        caption="Plan capacities"
        rows={[...rows]}
        rowKey={(r) => r.k}
        columns={[
          { key: 'l', header: 'Addition', cell: (r) => r.label },
          { key: 's', header: 'Stochastic', align: 'right', cell: (r) => (r.unit === 'MW' ? fmtMW(run.additions?.[r.k]) : fmtMWh(run.additions?.[r.k])) },
          { key: 'd', header: 'Deterministic', align: 'right', cell: (r) => (r.unit === 'MW' ? fmtMW(det[r.k]) : fmtMWh(det[r.k])) },
          { key: 'x', header: 'Δ', align: 'right', cell: (r) => { const a = run.additions?.[r.k]; const b = det[r.k]; return isNum(a) && isNum(b) ? fmtDelta(a - b, 0, r.unit) : DASH; } },
        ]}
      />
    </div>
  );
}

function EevTable({ run }: { run: RunPayload }) {
  const eev = new Map((run.deterministic_comparison?.eev_scenarios ?? []).map((s) => [s.key, s]));
  const cost = (s?: ScenarioMetrics) => (s ? (s.total_cost_keur_annualised ?? null) : null);
  return (
    <DataTable
      dense
      caption="Stochastic (RP) versus deterministic plan (EEV) per scenario"
      rows={run.scenarios}
      rowKey={(s) => s.key}
      columns={[
        { key: 'sc', header: 'Scenario', cell: (s) => s.label || scenarioLabel(s.key) },
        { key: 'p', header: 'Prob.', align: 'right', cell: (s) => fmtPct(s.probability, 1) },
        { key: 'rc', header: 'RP cost M€/yr', align: 'right', cell: (s) => meurParts(cost(s)).value },
        { key: 'ec', header: 'EEV cost M€/yr', align: 'right', cell: (s) => meurParts(cost(eev.get(s.key))).value },
        { key: 'dc', header: 'Δ cost', align: 'right', cell: (s) => { const a = cost(s); const b = cost(eev.get(s.key)); return isNum(a) && isNum(b) ? fmtDelta((b - a) / 1000, 1, 'M€') : DASH; } },
        { key: 're', header: 'RP ENS MWh', align: 'right', cell: (s) => fmtNum(s.ens_mwh, 0) },
        { key: 'ee', header: 'EEV ENS MWh', align: 'right', cell: (s) => fmtNum(eev.get(s.key)?.ens_mwh, 0) },
        { key: 'ri', header: 'RP imports GWh', align: 'right', cell: (s) => fmtNum((s.imports_mwh ?? NaN) / 1000, 1) },
        { key: 'ei', header: 'EEV imports GWh', align: 'right', cell: (s) => fmtNum((eev.get(s.key)?.imports_mwh ?? NaN) / 1000, 1) },
      ]}
    />
  );
}

function FailureCases({ run }: { run: RunPayload }) {
  const short = run.scenarios.filter((s) => isNum(s.ens_mwh) && s.ens_mwh > 1e-6);
  const eevShort = (run.deterministic_comparison?.eev_scenarios ?? []).filter((s) => isNum(s.ens_mwh) && s.ens_mwh > 1e-6);
  const severe = (e: Explanation) => e.severity === 'warning' || e.severity === 'critical' || e.kind === 'binding';
  return (
    <div className="space-y-4">
      {short.length === 0 && eevShort.length === 0 ? (
        <Callout tone="ok" title="No unserved energy in any scenario">Both the stochastic and the deterministic plan serve all demand in every modelled scenario.</Callout>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...short.map((s) => ({ s, plan: 'Stochastic plan' })), ...eevShort.map((s) => ({ s, plan: 'Deterministic plan (EEV)' }))].map(({ s, plan }) => (
            <Callout key={`${plan}-${s.key}`} tone="warn" title={`${plan} · ${s.label || scenarioLabel(s.key)}`}>
              <span className="num">{fmtNum(s.ens_mwh, 0)} MWh</span> unserved over <span className="num">{fmtNum(s.lol_hours, 0)} h</span>; peak shortfall <span className="num">{fmtMW(s.peak_shortfall_mw)}</span>; import cap binding{' '}
              <span className="num">{fmtNum(s.import_cap_binding_hours, 0)} h</span>.
            </Callout>
          ))}
        </div>
      )}
      <Explanations items={run.explanations ?? []} filter={severe} />
    </div>
  );
}

function StochasticBody({ run }: { run: RunPayload }) {
  const dc = run.deterministic_comparison;
  const info = run.stochastic;
  const expCost = money(run.expected?.total_cost_keur_annualised ?? run.objective_keur_annualised, run.objective_keur);
  const cvar = money(run.risk?.cvar_keur_annualised, run.risk?.cvar_keur);
  const vss = money(dc?.vss_keur_annualised, dc?.vss_keur);
  const evpi = money(dc?.evpi_keur_annualised, dc?.evpi_keur);
  const premium = money(dc?.expected_cost_premium_keur_annualised, null);
  const cvarRed = money(dc?.cvar_reduction_keur_annualised, null);
  const lam = run.risk?.lambda;
  const evpiNA = !isNum(dc?.evpi_keur_annualised) && !isNum(dc?.evpi_keur) && isNum(lam) && lam > 0;
  const passes = Array.isArray(info?.boundary_passes) ? info.boundary_passes.length : info?.boundary_passes;
  if (!info?.implemented)
    return (
      <EmptyState icon={<ShieldCheck size={22} />} title="Stochastic planning — in development">
        This payload does not declare <code className="num">stochastic.implemented</code>.
      </EmptyState>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone="uncertainty">{info.n_scenarios} scenarios</Badge>
        <Badge tone="neutral">method: {info.method}</Badge>
        {info.week_start_days?.length ? <Badge tone="neutral">representative weeks start days {info.week_start_days.join(', ')}</Badge> : null}
        {isNum(passes) && <Badge tone="neutral">boundary passes: {passes}</Badge>}
        <Badge tone="neutral">metrics basis: {run.horizon?.metrics_basis ?? 'horizon'}</Badge>
        {isNum(run.risk?.alpha) && <Badge tone="uncertainty">α = {run.risk?.alpha}</Badge>}
        {isNum(run.risk?.lambda) && <Badge tone="uncertainty">λ = {run.risk?.lambda}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Expected total cost" value={expCost.value} unit={expCost.unit} tone="money" sub="stochastic plan (RP)" />
        <Kpi label={`CVaR${isNum(run.risk?.alpha) ? ` α=${run.risk?.alpha}` : ''}`} value={cvar.value} unit={cvar.unit} tone="warn" sub="mean loss in the worst tail" />
        <Kpi label="VSS" value={vss.value} unit={vss.unit} tone="uncertainty" sub="EEV − RP on E + λ·CVaR (≥ 0)" />
        <Kpi label="Price of risk aversion" value={premium.value} unit={premium.unit} tone="money" sub="RP − EEV on expected cost alone" />
        <Kpi label="CVaR reduction" value={cvarRed.value} unit={cvarRed.unit} tone="renew" sub="EEV CVaR − RP CVaR" />
        <Kpi label="EVPI" value={evpiNA ? 'n/a' : evpi.value} unit={evpiNA ? undefined : evpi.unit} tone="uncertainty" sub={evpiNA ? `only defined for λ = 0 (here λ = ${lam})` : 'value of perfect information'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel eyebrow="Scenario set" title="Scenario probabilities">
          <ProbabilityChart scen={run.scenarios} />
        </Panel>
        <Panel eyebrow="Tail risk" title="Cost distribution across scenarios">
          <LossDistribution run={run} />
        </Panel>
      </div>
      {dc ? (
        <>
          <Panel eyebrow="Deterministic vs stochastic" title="What changes when the plan sees every scenario">
            <PlanComparison run={run} />
            {dc.notes && <p className="mt-3 text-[0.75rem] text-ink-3">{dc.notes}</p>}
          </Panel>
          <Panel eyebrow="EEV vs RP" title="Each plan re-evaluated under each scenario">
            <EevTable run={run} />
          </Panel>
        </>
      ) : (
        <Callout tone="info">This stochastic payload has no deterministic comparison block.</Callout>
      )}
      <Panel eyebrow="Failure cases" title="Where the system struggles">
        <FailureCases run={run} />
      </Panel>
    </div>
  );
}

export default function Risk() {
  const stoch = useExperiment<RunPayload>(REFERENCE_IDS.stochastic);
  const sens = useExperiment<SensitivityPayload>(REFERENCE_IDS.sensitivity);
  const frontier = useExperiment<FrontierPayload>(REFERENCE_IDS.frontier);
  const names = useMemo(() => new Map((frontier.data?.strategies ?? []).map((s) => [s.id, s.name])), [frontier.data]);
  const run = stoch.data;
  return (
    <Page>
      <PageHeader
        eyebrow="Risk & Uncertainty"
        title="Planning for the dry years, not just the average one"
        lead="Two-stage stochastic optimisation over reconstructed hydrological years with a Conditional Value-at-Risk term, plus one-at-a-time and two-way sensitivities and a regret-based robustness check."
        meta={
          <>
            {run && <RunTag run={{ ...run, reference: run.reference ?? true }} />}
            {sens.data && <RunTag run={{ ...sens.data, status: 'Optimal', reference: sens.data.reference ?? true }} />}
          </>
        }
        actions={run ? <DownloadButtons runId={run.run_id} formats={['json', 'metrics_csv']} /> : undefined}
      />
      <Panel eyebrow="Method" title="Deterministic vs stochastic planning">
        <Explainer />
      </Panel>
      <RefGate id={REFERENCE_IDS.stochastic} state={stoch} height={360}>
        {(r) => <StochasticBody run={r} />}
      </RefGate>
      <RefGate id={REFERENCE_IDS.sensitivity} state={sens} height={300}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <TornadoChart d={d} />
              <SensitivityHeatmap d={d} />
            </div>
            <DroughtSweep d={d} />
            <RegretMatrix d={d} names={names} />
          </div>
        )}
      </RefGate>
      <DataLabel label={run?.data_label ?? sens.data?.data_label} />
    </Page>
  );
}
