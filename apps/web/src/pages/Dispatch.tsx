import { useMemo, useState } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { REFERENCE_IDS, type RunPayload } from '../api/types';
import { AvailabilityChart, DispatchChart, PriceChart } from '../components/charts/RunCharts';
import { toPlotTime } from '../components/charts/plotTheme';
import { SyncXProvider, useSyncX } from '../components/charts/SyncX';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { RunLoader } from '../components/layout/RunLoader';
import { RunSelector, useRunParam } from '../components/layout/RunSelector';
import { Button, Panel, Segmented, StatList } from '../components/ui/primitives';
import { DataLabel, DownloadButtons, RunTag } from '../components/ui/run';
import { fmtEnergy, fmtHours, fmtPct, fmtPrice, fmtUtc, scenarioLabel } from '../lib/format';
import { primaryMetrics, scenarioKeys, seriesFor } from '../lib/run';

type Window = '1' | '3' | '7' | 'all';

function addHours(plotTime: string, h: number): string {
  const d = new Date(`${plotTime.replace(' ', 'T')}Z`);
  d.setUTCHours(d.getUTCHours() + h);
  return toPlotTime(d.toISOString().replace(/\.\d{3}Z$/, 'Z'));
}

function WindowControls({ run, scenario }: { run: RunPayload; scenario: string | null }) {
  const { range, setRange } = useSyncX();
  const s = seriesFor(run, scenario);
  const first = s ? s.timestamps[0] : null;
  const last = s ? s.timestamps[s.timestamps.length - 1] : null;
  const [win, setWin] = useState<Window>('all');
  const [day, setDay] = useState<string>(first ? first.slice(0, 10) : '');
  if (!s || !first || !last) return null;

  const apply = (w: Window, d: string) => {
    setWin(w);
    if (w === 'all') return setRange(null);
    const start = toPlotTime(`${d}T00:00:00Z`);
    setRange([start, addHours(start, Number(w) * 24)]);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="day-picker" className="eyebrow flex items-center gap-1">
          <CalendarDays size={11} aria-hidden /> Start day (UTC)
        </label>
        <input
          id="day-picker"
          type="date"
          min={first.slice(0, 10)}
          max={last.slice(0, 10)}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            apply(win === 'all' ? '1' : win, e.target.value);
          }}
          className="h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Window</span>
        <Segmented<Window>
          label="Zoom window"
          value={win}
          onChange={(w) => apply(w, day)}
          options={[
            { value: '1', label: '1 day' },
            { value: '3', label: '3 days' },
            { value: '7', label: '1 week' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {range && (
        <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => apply('all', day)}>
          Reset zoom
        </Button>
      )}
      <span className="num text-[0.7rem] text-ink-3">
        {range ? `${range[0]} → ${range[1]} UTC` : `${fmtUtc(first)} → ${fmtUtc(last)}`}
      </span>
    </div>
  );
}

function DispatchBody({ run }: { run: RunPayload }) {
  const keys = scenarioKeys(run);
  const [scenario, setScenario] = useState<string | null>(keys[0] ?? null);
  const m = useMemo(() => (run.scenarios.length === 1 ? run.scenarios[0] : (run.scenarios.find((x) => x.key === scenario) ?? primaryMetrics(run))), [run, scenario]);
  return (
    <SyncXProvider>
      <div className="flex flex-wrap items-center gap-2">
        <RunTag run={run} />
        {keys.length > 1 && <Segmented label="Scenario" size="sm" value={scenario ?? keys[0]} onChange={setScenario} options={keys.map((k) => ({ value: k, label: scenarioLabel(k) }))} />}
        <div className="ml-auto">
          <DownloadButtons runId={run.run_id} />
        </div>
      </div>
      <Panel bodyClassName="py-3">
        <WindowControls run={run} scenario={scenario} />
      </Panel>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel eyebrow="Generation · MW" title="Stacked dispatch (exports and battery charging below zero)">
            <DispatchChart run={run} scenario={scenario} height={420} />
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel eyebrow="Solar · MW" title="Availability vs dispatch">
              <AvailabilityChart run={run} scenario={scenario} tech="solar" />
            </Panel>
            <Panel eyebrow="Wind · MW" title="Availability vs dispatch">
              <AvailabilityChart run={run} scenario={scenario} tech="wind" />
            </Panel>
          </div>
          <Panel eyebrow="Energy-balance dual · €/MWh" title="System marginal cost (shadow price)">
            <PriceChart run={run} scenario={scenario} height={240} />
            <p className="mt-2 text-xs text-ink-3">
              The shadow price is the dual of the hourly balance constraint of this LP. Values above the import price indicate binding supply constraints; values near VOLL indicate shortage hours.
            </p>
          </Panel>
        </div>
        <Panel eyebrow="Scenario metrics" title={m.label ?? 'Summary'} className="h-fit">
          <StatList
            items={[
              { label: 'Demand', value: fmtEnergy(m.demand_mwh) },
              { label: 'Reservoir hydro', value: fmtEnergy(m.hydro_res_mwh) },
              { label: 'Run-of-river', value: fmtEnergy(m.ror_mwh) },
              { label: 'Solar PV', value: fmtEnergy(m.pv_mwh) },
              { label: 'Wind', value: fmtEnergy(m.wind_mwh) },
              { label: 'Imports', value: fmtEnergy(m.imports_mwh) },
              { label: 'Exports', value: fmtEnergy(m.exports_mwh) },
              { label: 'Unserved', value: fmtEnergy(m.ens_mwh) },
              { label: 'PV curtailed', value: fmtEnergy(m.pv_curtail_mwh) },
              { label: 'Wind curtailed', value: fmtEnergy(m.wind_curtail_mwh) },
              { label: 'Curtailment share', value: fmtPct(m.curtailment_share) },
              { label: 'Import-cap binding', value: fmtHours(m.import_cap_binding_hours) },
              { label: 'Mean price', value: fmtPrice(m.price_mean_eur_mwh) },
              { label: 'Max price', value: fmtPrice(m.price_max_eur_mwh) },
              { label: 'Max balance residual', value: `${m.max_balance_residual_mw ?? '—'} MW` },
            ]}
          />
        </Panel>
      </div>
      <DataLabel label={run.data_label} />
    </SyncXProvider>
  );
}

export default function Dispatch() {
  const [id, setId] = useRunParam(REFERENCE_IDS.normalAnnual);
  return (
    <Page>
      <PageHeader
        eyebrow="03 · Grid Dispatch Explorer"
        title="Hour-by-hour coordination"
        lead="Synchronised generation, renewable availability and marginal-cost charts for any reference or live run. Zoom on one chart and the others follow."
        actions={<RunSelector value={id} onChange={setId} />}
      />
      <RunLoader id={id} onSelect={setId}>
        {(run) => <DispatchBody key={run.run_id} run={run} />}
      </RunLoader>
    </Page>
  );
}
