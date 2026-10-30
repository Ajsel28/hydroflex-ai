import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Activity, BatteryCharging, CircleCheck, Coins, Droplets, Gauge, PlugZap, Timer, TriangleAlert, Zap } from 'lucide-react';
import { REFERENCE_IDS, type RunPayload } from '../api/types';
import { DispatchChart, EnergySankey, ReservoirChart } from '../components/charts/RunCharts';
import { SyncXProvider } from '../components/charts/SyncX';
import { toPlotTime } from '../components/charts/plotTheme';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { RunLoader } from '../components/layout/RunLoader';
import { RunSelector, useRunParam } from '../components/layout/RunSelector';
import { GridMap } from '../components/map/AlbaniaMap';
import { Badge, Kpi, Panel, Segmented } from '../components/ui/primitives';
import { DataLabel, DownloadButtons, Explanations, RunTag, Warnings } from '../components/ui/run';
import { energyParts, fmtHours, fmtNum, fmtPct, fmtSeconds, fmtUtc, isNum, meurParts, scenarioLabel } from '../lib/format';
import { annualCostKeur, assumptionValue, primaryMetrics, scenarioKeys, seriesFor } from '../lib/run';
import { useApp } from '../state/app';

export function horizonLabel(run: RunPayload): string {
  if (run.horizon?.metrics_basis === 'annualised') return 'annualised (representative weeks)';
  const h = run.horizon?.hours;
  if (!isNum(h)) return 'modelled horizon';
  if (h >= 8760) return 'full year';
  if (h % 24 === 0) return `${h / 24}-day horizon`;
  return `${h} h horizon`;
}

export function MissionKpis({ run }: { run: RunPayload }) {
  const m = primaryMetrics(run);
  const demand = energyParts(m.demand_mwh);
  const imports = energyParts(m.imports_mwh);
  const net = energyParts(m.net_imports_mwh);
  const cost = meurParts(annualCostKeur(run));
  const hz = horizonLabel(run);
  const ens = m.ens_mwh;
  const scen = run.scenarios.length === 1 ? run.scenarios[0].label : `${run.scenarios.length} scenarios (expected)`;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-testid="mission-kpis">
      <Kpi label="Total demand" value={demand.value} unit={demand.unit} sub={hz} tone="hydro" icon={<Zap size={14} />} />
      <Kpi label="System cost" value={cost.value} unit="M€/yr" sub="annualised objective" tone="money" icon={<Coins size={14} />} />
      <Kpi label="Domestic supply" value={fmtNum(isNum(m.domestic_supply_share) ? m.domestic_supply_share * 100 : null, 1)} unit="%" sub={`renewable share of generation ${fmtPct(m.renewable_share_of_generation)}`} tone="renew" icon={<Droplets size={14} />} />
      <Kpi label="Imports" value={imports.value} unit={imports.unit} sub={`net ${net.value} ${net.unit} · ${fmtPct(m.import_share)} of demand`} tone="neutral" icon={<PlugZap size={14} />} />
      <Kpi
        label="Unserved energy"
        value={fmtNum(ens, isNum(ens) && ens > 0 && ens < 10 ? 1 : 0)}
        unit="MWh"
        sub={isNum(ens) && ens > 0 ? `${fmtHours(m.lol_hours)} loss-of-load` : 'demand fully served'}
        tone={isNum(ens) && ens > 0 ? 'warn' : 'ok'}
        icon={isNum(ens) && ens > 0 ? <TriangleAlert size={14} /> : <CircleCheck size={14} />}
      />
      <Kpi label="Battery utilisation" value={fmtNum(isNum(m.battery_utilisation) ? m.battery_utilisation * 100 : null, 1)} unit="%" sub={`${fmtNum(m.battery_cycles, 1)} cycles · ${fmtNum(run.capacities.bp, 0)} MW / ${fmtNum(run.capacities.be, 0)} MWh`} tone="uncertainty" icon={<BatteryCharging size={14} />} />
      <Kpi label="Mean shadow price" value={fmtNum(m.price_mean_eur_mwh, 1)} unit="€/MWh" sub={`max ${fmtNum(m.price_max_eur_mwh, 0)} €/MWh`} tone="money" icon={<Activity size={14} />} />
      <Kpi label="Scenario" value={scen} sub={`${run.kind} · from ${fmtUtc(run.horizon?.start_utc, false)}`} tone="hydro" icon={<Gauge size={14} />} />
      <Kpi label="Solver" value={run.solver?.status ?? run.status} sub={`HiGHS ${run.solver?.version ?? ''} · ${fmtSeconds(run.solver?.solve_seconds)} solve`} tone={run.optimal ? 'ok' : 'warn'} icon={<Timer size={14} />} />
      <Kpi label="Reservoir end volume" value={fmtNum(m.res_v_end_hm3, 0)} unit="hm³" sub={`start ${fmtNum(m.res_v_start_hm3, 0)} · min ${fmtNum(m.res_v_min_hm3, 0)} hm³`} tone="hydro" icon={<Droplets size={14} />} />
    </div>
  );
}

function peakIndex(run: RunPayload, scenario: string | null): number {
  const s = seriesFor(run, scenario);
  if (!s) return 0;
  let best = 0;
  s.series.demand.forEach((v, i) => {
    if ((v ?? -Infinity) > (s.series.demand[best] ?? -Infinity)) best = i;
  });
  return best;
}

/** For long runs, open on the week around the peak-demand hour (the full range stays one click away via "all"). */
function weekAround(run: RunPayload, scenario: string | null, idx: number): [string, string] | null {
  const s = seriesFor(run, scenario);
  if (!s || s.timestamps.length * (run.horizon?.resolution_h ?? 1) <= 24 * 21) return null;
  const step = Math.max(1, Math.round(168 / (run.horizon?.resolution_h ?? 1)));
  const a = Math.max(0, Math.min(idx - Math.floor(step / 2), s.timestamps.length - step));
  return [toPlotTime(s.timestamps[a]), toPlotTime(s.timestamps[Math.min(s.timestamps.length - 1, a + step)])];
}

function MissionBody({ run }: { run: RunPayload }) {
  const keys = scenarioKeys(run);
  const [scenario, setScenario] = useState<string | null>(keys[0] ?? null);
  const initialIdx = useMemo(() => peakIndex(run, keys[0] ?? null), [run, keys]);
  const [idx, setIdx] = useState<number>(initialIdx);
  const vmin = assumptionValue(run, 'res_vmin_hm3');
  const vmax = run.capacities?.vmax ?? null;
  const metrics = useMemo(() => {
    if (run.scenarios.length === 1) return run.scenarios[0];
    return run.scenarios.find((s) => s.key === scenario) ?? primaryMetrics(run);
  }, [run, scenario]);

  const initialRange = useMemo(() => weekAround(run, keys[0] ?? null, initialIdx), [run, keys, initialIdx]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <RunTag run={run} />
        <Badge tone="neutral">{run.run_id}</Badge>
        {keys.length > 1 && (
          <Segmented label="Scenario timeseries" size="sm" value={scenario ?? keys[0]} onChange={setScenario} options={keys.map((k) => ({ value: k, label: scenarioLabel(k) }))} />
        )}
        <div className="ml-auto">
          <DownloadButtons runId={run.run_id} />
        </div>
      </div>
      <MissionKpis run={run} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel eyebrow="Hourly dispatch · MW" title="Generation stack and demand" actions={<Link to={`/dispatch?run=${encodeURIComponent(run.run_id)}`} className="text-xs text-hydro hover:underline">Open in Dispatch Explorer →</Link>}>
          <SyncXProvider initial={initialRange}>
            <DispatchChart run={run} scenario={scenario} height={400} cursorIndex={idx} />
          </SyncXProvider>
          <p className="mt-2 text-xs text-ink-3">{initialRange ? 'Opens on the week around the peak-demand hour; press “all” for the full horizon. ' : ''}Dotted vertical line = hour selected on the map (also marked on the full-horizon reservoir chart below). Synchronised zoom across charts is in the Dispatch Explorer.</p>
        </Panel>
        <Panel eyebrow="Albania · aggregate flows" title="Grid map" bodyClassName="p-3 sm:p-4">
          <GridMap run={run} scenario={scenario} index={idx} onIndex={setIdx} compact />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel eyebrow="Seasonal storage · hm³" title="Reservoir trajectory with bounds">
          <ReservoirChart run={run} scenario={scenario} vmin={vmin} vmax={vmax} height={300} cursorIndex={idx} />
        </Panel>
        <Panel eyebrow={`Energy balance · ${horizonLabel(run)}`} title="Where the energy comes from and goes">
          <EnergySankey metrics={metrics} run={run.scenarios.length === 1 ? run : null} horizonLabel={horizonLabel(run)} height={300} />
        </Panel>
      </div>

      <Panel eyebrow="Generated by the solver post-processor" title="Scientific interpretation">
        <Explanations items={run.explanations ?? []} />
        {run.warnings?.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="eyebrow mb-2">Warnings</div>
            <Warnings warnings={run.warnings} />
          </div>
        )}
      </Panel>
      <DataLabel label={run.data_label} />
    </>
  );
}

export default function MissionControl() {
  const [id, setId] = useRunParam(REFERENCE_IDS.normalAnnual);
  const { liveRun } = useApp();
  return (
    <Page>
      <PageHeader
        eyebrow="01 · Mission Control"
        title="System state at a glance"
        lead="Key performance indicators, hourly dispatch, reservoir trajectory and energy balance for the selected run. Defaults to the full-year reference experiment under normal hydrology with the existing fleet."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <RunSelector value={id} onChange={setId} />
            {liveRun && liveRun.run_id !== id && (
              <button type="button" onClick={() => setId(liveRun.run_id)} className="h-9 rounded-lg border border-line px-3 text-xs text-ink-2 hover:bg-panel-2 hover:text-ink">
                Latest live run
              </button>
            )}
          </div>
        }
      />
      <RunLoader id={id} onSelect={setId}>
        {(run) => <MissionBody key={run.run_id} run={run} />}
      </RunLoader>
    </Page>
  );
}
