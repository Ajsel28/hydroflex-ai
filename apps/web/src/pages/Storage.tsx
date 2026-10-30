import { useMemo } from 'react';
import { BatteryCharging, Waves } from 'lucide-react';
import { useExperiment } from '../api/hooks';
import { REFERENCE_IDS, isRunPayload, type RunPayload, type StoredExperiment } from '../api/types';
import { BatteryChart, HydroFlowChart, ReservoirChart } from '../components/charts/RunCharts';
import { SyncXProvider } from '../components/charts/SyncX';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { RunSelector, useRunParam } from '../components/layout/RunSelector';
import { Callout } from '../components/ui/feedback';
import { EmptyState, Kpi, LoadingBlock, Panel, StatList } from '../components/ui/primitives';
import { DataLabel, RunTag } from '../components/ui/run';
import { energyParts, fmtHm3, fmtHours, fmtKEUR, fmtMWh, fmtNum, fmtPct, isNum } from '../lib/format';
import { assumptionValue, primaryMetrics, seriesFor } from '../lib/run';

function Missing({ id, error }: { id: string; error: string | null }) {
  return (
    <EmptyState icon={<Waves size={22} />} title="Run not available yet">
      <code className="font-mono text-xs">{id}</code> could not be loaded{error ? ` (${error})` : ''}. Reference experiments are generated in parallel; this view polls and will update when the
      artefact appears. You can also pick a live run.
    </EmptyState>
  );
}

function DroughtComparison() {
  const normal = useExperiment<RunPayload>(REFERENCE_IDS.normalAnnual);
  const moderate = useExperiment<RunPayload>(REFERENCE_IDS.moderateAnnual);
  const severe = useExperiment<RunPayload>(REFERENCE_IDS.severeAnnual);
  if (!normal.data || !severe.data) {
    return (
      <EmptyState title="Drought comparison pending">
        Requires reference experiments <code className="font-mono text-xs">{REFERENCE_IDS.normalAnnual}</code> and <code className="font-mono text-xs">{REFERENCE_IDS.severeAnnual}</code>. Not yet
        available — this panel will appear automatically once they are computed.
      </EmptyState>
    );
  }
  const compare = [{ run: severe.data, label: 'Severe drought' }, ...(moderate.data ? [{ run: moderate.data, label: 'Moderate drought' }] : [])];
  const runs = [normal.data, ...(moderate.data ? [moderate.data] : []), severe.data];
  const vmin = assumptionValue(normal.data, 'res_vmin_hm3');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {runs.map((r) => (
          <RunTag key={r.run_id} run={r} />
        ))}
      </div>
      <SyncXProvider>
        <ReservoirChart run={normal.data} vmin={vmin} vmax={normal.data.capacities.vmax} compare={compare} height={300} />
      </SyncXProvider>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th className="eyebrow px-2 py-2 font-normal">Scenario</th>
              <th className="eyebrow px-2 py-2 text-right font-normal">Inflow</th>
              <th className="eyebrow px-2 py-2 text-right font-normal">Reservoir hydro</th>
              <th className="eyebrow px-2 py-2 text-right font-normal">Min volume</th>
              <th className="eyebrow px-2 py-2 text-right font-normal">Hours at min</th>
              <th className="eyebrow px-2 py-2 text-right font-normal">Imports</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const m = primaryMetrics(r);
              return (
                <tr key={r.run_id} className="border-b border-line">
                  <td className="px-2 py-2 text-ink">{r.scenarios[0]?.label ?? r.run_id}</td>
                  <td className="num px-2 py-2 text-right">{fmtHm3(m.res_inflow_hm3)}</td>
                  <td className="num px-2 py-2 text-right">{(() => { const p = energyParts(m.hydro_res_mwh); return `${p.value} ${p.unit}`; })()}</td>
                  <td className="num px-2 py-2 text-right">{fmtHm3(m.res_v_min_hm3)}</td>
                  <td className="num px-2 py-2 text-right">{fmtHours(m.res_hours_at_min)}</td>
                  <td className="num px-2 py-2 text-right">{(() => { const p = energyParts(m.imports_mwh); return `${p.value} ${p.unit}`; })()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DataLabel label={normal.data.data_label} />
    </div>
  );
}

function FlexExplainer({ run }: { run: RunPayload }) {
  const m = primaryMetrics(run);
  const bp = run.capacities.bp;
  const be = run.capacities.be;
  const vmax = run.capacities.vmax;
  const vmin = assumptionValue(run, 'res_vmin_hm3');
  const kappa = assumptionValue(run, 'mwh_per_hm3');
  const pHydro = assumptionValue(run, 'hydro_res_p_mw');
  const duration = isNum(bp) && bp > 0 && isNum(be) ? be / bp : null;
  const usableHm3 = isNum(vmax) && isNum(vmin) ? vmax - vmin : null;
  const resEnergy = isNum(usableHm3) && isNum(kappa) ? usableHm3 * kappa : null;
  const resHours = isNum(resEnergy) && isNum(pHydro) && pHydro > 0 ? resEnergy / pHydro : null;
  const ratio = isNum(resEnergy) && isNum(be) && be > 0 ? resEnergy / be : null;
  const re = energyParts(resEnergy);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-panel-2/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-battery">
          <BatteryCharging size={16} aria-hidden />
          <h3 className="font-serif text-lg text-ink">Short-duration flexibility · battery</h3>
        </div>
        <p className="text-sm leading-relaxed text-ink-2">
          {isNum(be) && be > 0 ? (
            <>
              This run has <span className="num text-ink">{fmtNum(bp, 0)} MW</span> / <span className="num text-ink">{fmtNum(be, 0)} MWh</span> of batteries — a duration of{' '}
              <span className="num text-ink">{fmtNum(duration, 1)} h</span>. It cycled <span className="num text-ink">{fmtNum(m.battery_cycles, 1)}</span> full-equivalent times
              (throughput <span className="num text-ink">{fmtMWh(m.battery_throughput_mwh)}</span>). Batteries shift energy within a day — absorbing midday solar or low-price
              hours and discharging into evening peaks — but cannot carry energy across seasons.
            </>
          ) : (
            <>This run has no battery capacity, so intra-day shifting relies entirely on the reservoir and imports. Add battery power and energy in the Stress Lab to see hourly arbitrage.</>
          )}
        </p>
      </div>
      <div className="rounded-xl border border-line bg-panel-2/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-hydro">
          <Waves size={16} aria-hidden />
          <h3 className="font-serif text-lg text-ink">Long-duration flexibility · reservoir</h3>
        </div>
        <p className="text-sm leading-relaxed text-ink-2">
          The modelled reservoir’s usable volume (V<sub>max</sub> − V<sub>min</sub> = <span className="num text-ink">{fmtHm3(usableHm3)}</span>) at κ ={' '}
          <span className="num text-ink">{fmtNum(kappa, 1)} MWh/hm³</span> is equivalent to about{' '}
          <span className="num text-ink">
            {re.value} {re.unit}
          </span>
          {isNum(resHours) && (
            <>
              {' '}
              — roughly <span className="num text-ink">{fmtNum(resHours, 0)} h</span> ({fmtNum(resHours / 24, 0)} days) of full turbine output
            </>
          )}
          {isNum(ratio) && (
            <>
              , or <span className="num text-ink">{fmtNum(ratio, 0)}×</span> the battery energy
            </>
          )}
          . In this run the volume moved from <span className="num text-ink">{fmtHm3(m.res_v_start_hm3)}</span> to <span className="num text-ink">{fmtHm3(m.res_v_end_hm3)}</span>. That is
          seasonal storage: it decides how wet-season inflow is rationed through dry months and drought years.
        </p>
      </div>
    </div>
  );
}

export default function Storage() {
  const [id, setId] = useRunParam(REFERENCE_IDS.normalAnnual);
  const exp = useExperiment<StoredExperiment>(id);
  const run = exp.data && isRunPayload(exp.data) ? exp.data : null;
  const m = run ? primaryMetrics(run) : null;
  const vmin = run ? assumptionValue(run, 'res_vmin_hm3') : null;
  const hasBattery = useMemo(() => {
    if (!run) return false;
    if ((run.capacities.be ?? 0) > 0 || (run.capacities.bp ?? 0) > 0) return true;
    const s = seriesFor(run);
    return !!s && s.series.soc_mwh.some((v) => (v ?? 0) > 1e-6);
  }, [run]);

  return (
    <Page>
      <PageHeader
        eyebrow="Reservoir & Storage Intelligence"
        title="Seasonal water, hourly batteries"
        lead="How the Drin reservoir and battery storage provide flexibility on very different time scales — read directly from the solved dispatch."
        actions={<RunSelector value={id} onChange={setId} />}
        meta={run ? <RunTag run={run} /> : null}
      />
      {exp.loading && <LoadingBlock label="Loading run…" height={360} />}
      {!exp.loading && !run && <Missing id={id} error={exp.data ? 'not a dispatch run' : (exp.error?.message ?? null)} />}
      {run && m && (
        <SyncXProvider>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Kpi label="Inflow" value={fmtNum(m.res_inflow_hm3, 0)} unit="hm³" tone="hydro" />
            <Kpi label="Turbine release" value={fmtNum(m.res_release_hm3, 0)} unit="hm³" tone="hydro" />
            <Kpi label="Spill" value={fmtNum(m.res_spill_hm3, 1)} unit="hm³" tone="caution" />
            <Kpi label="Start → end volume" value={`${fmtNum(m.res_v_start_hm3, 0)} → ${fmtNum(m.res_v_end_hm3, 0)}`} unit="hm³" />
            <Kpi label="Minimum volume" value={fmtNum(m.res_v_min_hm3, 0)} unit="hm³" sub={`bound V_min ${fmtHm3(vmin)}`} tone="warn" />
            <Kpi label="Hours at minimum" value={fmtNum(m.res_hours_at_min, 0)} unit="h" />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Reservoir storage trajectory" eyebrow="Volume with bounds">
              <ReservoirChart run={run} vmin={vmin} vmax={run.capacities.vmax} height={300} />
            </Panel>
            <Panel title="Inflow, release, spill and hydro output" eyebrow="Water balance">
              <HydroFlowChart run={run} height={300} />
            </Panel>
          </div>

          <Panel title="Battery operation" eyebrow="State of charge · charge/discharge">
            {hasBattery ? (
              <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                <BatteryChart run={run} height={320} />
                <StatList
                  items={[
                    { label: 'Power / energy', value: `${fmtNum(run.capacities.bp, 0)} MW / ${fmtNum(run.capacities.be, 0)} MWh` },
                    { label: 'Throughput', value: fmtMWh(m.battery_throughput_mwh) },
                    { label: 'Full cycles', value: fmtNum(m.battery_cycles, 1) },
                    { label: 'Utilisation', value: fmtPct(m.battery_utilisation) },
                    { label: 'Losses', value: fmtMWh(m.battery_losses_mwh) },
                    { label: 'Degradation-proxy cost', value: fmtKEUR(m.battery_degradation_keur, 1) },
                    { label: 'Simultaneous ch./dis.', value: fmtMWh(m.simultaneous_ch_dis_mwh, 1), title: 'Monitored ex post; the LP has no binaries' },
                  ]}
                />
              </div>
            ) : (
              <EmptyState icon={<BatteryCharging size={22} />} title="No battery in this run">
                The selected run has zero battery power and energy capacity. Run the Stress Lab with battery capacity (e.g. 300 MW / 1,200 MWh) to inspect state-of-charge dynamics.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Short- vs long-duration flexibility" eyebrow="Interpretation grounded in this run">
            <FlexExplainer run={run} />
          </Panel>
          {run.warnings?.length > 0 && <Callout tone="caution" title="Solver warnings">{run.warnings.join(' · ')}</Callout>}
          <DataLabel label={run.data_label} />
        </SyncXProvider>
      )}

      <Panel title="Drought vs normal reservoir trajectories" eyebrow="Reference experiments">
        <DroughtComparison />
      </Panel>
    </Page>
  );
}
