import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { RunPayload, ScenarioMetrics } from '../../api/types';
import { energyParts, fmtEnergy, fmtHours, fmtMEUR, fmtMEURyr, fmtMW, fmtMWh, fmtNum, fmtPct, fmtPrice, meurParts, scenarioLabel } from '../../lib/format';
import { annualCostKeur, assumptionValue, primaryMetrics, scenarioKeys } from '../../lib/run';
import { DispatchChart, PriceChart, ReservoirChart } from '../charts/RunCharts';
import { SyncXProvider } from '../charts/SyncX';
import { Callout } from '../ui/feedback';
import { Kpi, Panel, Select, StatList } from '../ui/primitives';
import { DataLabel, DataTable, DownloadButtons, Explanations, RunTag, SolverDiagnostics, Warnings } from '../ui/run';

export function StatusBlock({ run }: { run: RunPayload }) {
  const status = run.solver?.status ?? run.status;
  const ok = run.optimal;
  return (
    <div
      data-testid="lab-status"
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
      style={{ color: ok ? 'var(--ok)' : 'var(--caution)', borderColor: `color-mix(in srgb, ${ok ? 'var(--ok)' : 'var(--caution)'} 40%, transparent)` }}
    >
      {ok ? <CheckCircle2 size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
      <span className="font-mono text-xs uppercase tracking-wider text-ink-3">HiGHS status</span>
      <span className="font-semibold">{status}</span>
    </div>
  );
}

function ScenarioTable({ rows }: { rows: ScenarioMetrics[] }) {
  return (
    <DataTable<ScenarioMetrics>
      caption="Per-scenario metrics"
      dense
      rows={rows}
      rowKey={(r) => r.key}
      columns={[
        { key: 'scen', header: 'Scenario', cell: (r) => r.label ?? scenarioLabel(r.key) },
        { key: 'p', header: 'Prob.', align: 'right', cell: (r) => fmtPct(r.probability, 1) },
        { key: 'cost', header: 'Total cost', align: 'right', cell: (r) => fmtMEURyr(r.total_cost_keur_annualised) },
        { key: 'imp', header: 'Imports', align: 'right', cell: (r) => fmtEnergy(r.imports_mwh) },
        { key: 'ens', header: 'ENS', align: 'right', cell: (r) => fmtEnergy(r.ens_mwh) },
        { key: 'lol', header: 'LOL', align: 'right', cell: (r) => fmtHours(r.lol_hours) },
        { key: 'price', header: 'Mean price', align: 'right', cell: (r) => fmtPrice(r.price_mean_eur_mwh) },
      ]}
    />
  );
}

/** Full result view for a run payload (live or stored). All values come from the payload. */
export function RunResults({ run }: { run: RunPayload }) {
  const m = primaryMetrics(run);
  const keys = scenarioKeys(run);
  const [scen, setScen] = useState<string>(keys[0] ?? '');
  const scenario = keys.includes(scen) ? scen : (keys[0] ?? null);
  const cost = meurParts(annualCostKeur(run));
  const demand = energyParts(m.demand_mwh);
  const imports = energyParts(m.imports_mwh);
  const ens = energyParts(m.ens_mwh);
  const vmin = assumptionValue(run, 'res_vmin_hm3');
  const multi = run.scenarios.length > 1;
  const dc = run.deterministic_comparison;
  const add = run.additions;
  const hasAdditions = run.kind !== 'simulate';
  const annualBasis = run.horizon?.metrics_basis === 'annualised';
  const basis = annualBasis ? 'annualised (representative weeks)' : `${fmtNum(run.horizon?.hours, 0)} h horizon`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBlock run={run} />
          <RunTag run={run} />
          <span className="font-mono text-[0.68rem] text-ink-3">{run.run_id}</span>
        </div>
        <DownloadButtons runId={run.run_id} />
      </div>

      {!run.optimal && (
        <Callout tone="warn" title={`The solver did not return an optimal solution (“${run.solver?.status ?? run.status}”)`}>
          Numbers below may be incomplete or meaningless. Typical causes: an infeasible combination of bounds (e.g. terminal reservoir level that cannot be reached), or a time limit on a very large
          horizon. Check the warnings and explanations, then relax the horizon or the parameters and re-run.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi label={multi ? 'Exp. demand' : 'Demand'} value={demand.value} unit={demand.unit} sub={basis} tone="neutral" />
        <Kpi label="System cost" value={cost.value} unit={`${cost.unit}/yr`} sub="annualised objective" tone="money" />
        <Kpi label="Domestic supply" value={fmtNum((m.domestic_supply_share ?? NaN) * 100, 1)} unit="%" sub="share of demand" tone="renew" />
        <Kpi label="Imports" value={imports.value} unit={imports.unit} sub={`net ${fmtEnergy(m.net_imports_mwh)} · ${annualBasis ? 'per year' : 'horizon'}`} tone="neutral" />
        <Kpi label="Unserved energy" value={ens.value} unit={ens.unit} sub={`${fmtHours(m.lol_hours)} loss of load`} tone={(m.ens_mwh ?? 0) > 0 ? 'warn' : 'ok'} />
        <Kpi label="Mean shadow price" value={fmtNum(m.price_mean_eur_mwh, 1)} unit="€/MWh" sub={`max ${fmtPrice(m.price_max_eur_mwh)}`} tone="money" />
      </div>

      {hasAdditions && (
        <Panel title="Optimised capacity additions" eyebrow={run.kind === 'stochastic' ? 'First-stage decision (shared by all scenarios)' : 'Investment decision'}>
          <div className="grid gap-4 md:grid-cols-2">
            <StatList
              items={[
                { label: 'Solar PV added', value: fmtMW(add?.pv) },
                { label: 'Wind added', value: fmtMW(add?.wind) },
                { label: 'Battery power added', value: fmtMW(add?.bp) },
                { label: 'Battery energy added', value: fmtMWh(add?.be) },
                { label: 'Overnight capex', value: `${fmtNum(run.expected?.capex_overnight_meur, 1)} M€` },
                { label: 'Annualised capex', value: fmtMEURyr(run.expected?.capex_annualised_keur) },
                ...(run.duals?.budget_shadow_price
                  ? [{ label: 'Budget constraint', value: run.duals.budget_shadow_price.binding ? `binding · ${fmtNum(run.duals.budget_shadow_price.keur_per_keur_overnight_horizon, 4)} k€/k€` : 'not binding' }]
                  : []),
              ]}
            />
            {run.risk && (
              <StatList
                items={[
                  ...(run.risk.var_keur_annualised != null
                    ? [
                        { label: `VaR (α = ${run.risk.alpha ?? '—'}), annualised`, value: fmtMEURyr(run.risk.var_keur_annualised) },
                        { label: 'CVaR, annualised', value: fmtMEURyr(run.risk.cvar_keur_annualised) },
                        { label: 'Expected loss, annualised', value: fmtMEURyr(run.risk.expected_loss_keur_annualised) },
                      ]
                    : [
                        { label: `VaR (α = ${run.risk.alpha ?? '—'}), horizon`, value: fmtMEUR(run.risk.var_keur) },
                        { label: 'CVaR, horizon', value: fmtMEUR(run.risk.cvar_keur) },
                        { label: 'Expected loss, horizon', value: fmtMEUR(run.risk.expected_loss_keur) },
                      ]),
                  { label: 'Worst-scenario loss, horizon', value: fmtMEUR(run.risk.worst_loss_keur) },
                  ...(dc
                    ? [
                        { label: 'VSS (value of stochastic solution)', value: dc.vss_keur_annualised != null ? fmtMEURyr(dc.vss_keur_annualised) : fmtMEUR(dc.vss_keur) },
                        { label: 'EVPI', value: dc.evpi_keur_annualised != null ? fmtMEURyr(dc.evpi_keur_annualised) : fmtMEUR(dc.evpi_keur) },
                      ]
                    : []),
                ]}
              />
            )}
          </div>
        </Panel>
      )}

      {multi && (
        <Panel title="Scenario outcomes" eyebrow="Probability-weighted headline values above">
          <ScenarioTable rows={run.scenarios} />
        </Panel>
      )}

      <Panel
        title="Dispatch, price and reservoir"
        eyebrow="Synchronised: zoom one chart, all follow"
        actions={
          keys.length > 1 ? (
            <Select label="Scenario" hideLabel value={scenario ?? ''} onChange={setScen} options={keys.map((k) => ({ value: k, label: scenarioLabel(k) }))} />
          ) : undefined
        }
      >
        <SyncXProvider key={`${run.run_id}:${scenario}`}>
          <div className="space-y-2">
            <DispatchChart run={run} scenario={scenario} height={360} />
            {keys.length > 0 && (
              <div className="grid gap-2 lg:grid-cols-2">
                <PriceChart run={run} scenario={scenario} height={220} />
                <ReservoirChart run={run} scenario={scenario} height={220} vmin={vmin} vmax={run.capacities?.vmax ?? null} />
              </div>
            )}
          </div>
        </SyncXProvider>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Scientific interpretation" eyebrow="Generated by the backend from this solution" className="lg:col-span-3">
          <Explanations items={run.explanations ?? []} />
          {run.warnings?.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-2">Warnings</div>
              <Warnings warnings={run.warnings} />
            </div>
          )}
        </Panel>
        <Panel title="Solver diagnostics" className="lg:col-span-2">
          {run.solver ? <SolverDiagnostics solver={run.solver} run={run} /> : <p className="text-sm text-ink-3">No solver information in payload.</p>}
        </Panel>
      </div>
      <DataLabel label={run.data_label} />
    </div>
  );
}
