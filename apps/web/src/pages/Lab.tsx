import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, History } from 'lucide-react';
import { ApiError, api } from '../api/client';
import { useAsync, useExperimentList } from '../api/hooks';
import { isRunPayload, type ExperimentSummary, type RunPayload } from '../api/types';
import { ComparisonMatrix } from '../components/lab/ComparisonMatrix';
import { LabControls } from '../components/lab/LabControls';
import { RunResults } from '../components/lab/RunResults';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Callout } from '../components/ui/feedback';
import { EmptyState, LoadingBlock, Panel } from '../components/ui/primitives';
import { DataLabel, DataTable } from '../components/ui/run';
import { fmtMEUR, fmtUtc, scenarioLabel } from '../lib/format';
import {
  applyPreset,
  buildRequest,
  defaultForm,
  fieldForLoc,
  SCENARIO_FIELDS,
  validateForm,
  type FieldKey,
  type LabForm,
  type LabMode,
} from '../lib/validation';
import { useApp } from '../state/app';

const RUN_KINDS = new Set(['simulate', 'investment', 'stochastic']);

/** Model defaults (from /api/model/metadata assumptions) shown as placeholders for blank system fields. */
const DEFAULT_PARAM: Partial<Record<FieldKey, string>> = {
  pv_mw: 'pv_existing_mw',
  wind_mw: 'wind_existing_mw',
  battery_power_mw: 'battery_power_existing_mw',
  battery_energy_mwh: 'battery_energy_existing_mwh',
  import_capacity_mw: 'import_capacity_mw',
  voll_eur_mwh: 'voll_eur_mwh',
};

export default function Lab() {
  const { runModel, apiOnline, registryVersion } = useApp();
  const scen = useAsync(() => api.scenarios(), 'scenarios', 30_000);
  const meta = useAsync(() => api.metadata(), 'metadata', 30_000);
  const { list } = useExperimentList(30_000, registryVersion);

  const [form, setForm] = useState<LabForm>(defaultForm);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<RunPayload | null>(null);
  const [runError, setRunError] = useState<ApiError | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const presets = scen.data?.presets ?? null;
  const nStochastic = scen.data?.stochastic_set?.length || 5;

  // Fill scenario values from the selected preset once presets arrive (only if the user has not typed any).
  const [prefilled, setPrefilled] = useState(false);
  if (presets && !prefilled) {
    setPrefilled(true);
    const spec = presets.find((s) => s.key === form.preset);
    if (spec && SCENARIO_FIELDS.every((k) => form[k] === '')) setForm(applyPreset(form, spec));
  }

  const defaults = useMemo(() => {
    const out: Partial<Record<FieldKey, number>> = {};
    for (const [k, param] of Object.entries(DEFAULT_PARAM)) {
      const a = meta.data?.assumptions.find((x) => x.parameter === param);
      if (typeof a?.value === 'number') out[k as FieldKey] = a.value;
    }
    return out;
  }, [meta.data]);

  const validation = useMemo(() => validateForm(form, nStochastic), [form, nStochastic]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const onField = useCallback((k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
    setServerErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }, []);

  const onPreset = (key: string) => {
    const spec = presets?.find((s) => s.key === key);
    setForm((f) => (spec ? applyPreset(f, spec) : { ...f, preset: key as LabForm['preset'] }));
  };

  const onMode = (m: LabMode) => setForm((f) => ({ ...f, mode: m }));

  const run = async () => {
    setSubmitted(true);
    if (!validation.ok) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunError(null);
    setServerErrors({});
    setRunning(true);
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const out = await runModel(buildRequest(form), ctrl.signal);
      setResult(out);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
      if (!err.aborted) {
        setRunError(err);
        const mapped: Partial<Record<FieldKey, string>> = {};
        for (const fe of err.fieldErrors) {
          const k = fieldForLoc(fe.loc);
          if (k) mapped[k] = fe.msg;
        }
        // un-located 422 messages about the horizon (e.g. step limits) are attached to the hours field
        if (err.status === 422 && err.fieldErrors.length === 0 && /step|horizon|hour/i.test(err.message)) mapped.hours = err.message;
        setServerErrors(mapped);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const loadRun = async (id: string) => {
    setLoadingId(id);
    try {
      const d = await api.experiment(id);
      // A stored payload re-opened from history is not a fresh computation: label it as a session run.
      if (isRunPayload(d)) setResult({ ...d, freshly_computed: false });
      setRunError(null);
    } catch (e) {
      setRunError(e instanceof ApiError ? e : new ApiError(String(e), 0));
    } finally {
      setLoadingId(null);
    }
  };

  const history = useMemo<ExperimentSummary[]>(() => (list ?? []).filter((e) => !e.reference && RUN_KINDS.has(String(e.kind))), [list]);
  const elapsed = running ? Math.max(0, (now - startedAt) / 1000) : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Climate Stress Laboratory"
        title="Stress-test the system under drought, demand and market shocks"
        lead="Choose a climate preset, edit any parameter, and solve the optimisation live on the HiGHS LP solver. Every number shown after a run is returned by the API for that run."
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="order-1 lg:order-2 lg:col-span-4">
          <div className="lg:sticky lg:top-[4.5rem]">
            <Panel title="Experiment controls" eyebrow="Validated against API ranges" bodyClassName="p-4 sm:p-5 pb-0 sm:pb-0 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto scrollbar-thin">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run();
                }}
                noValidate
              >
                <LabControls
                  form={form}
                  presets={presets}
                  presetsError={scen.error ? scen.error.message : null}
                  nStochastic={nStochastic}
                  defaults={defaults}
                  validation={validation}
                  showErrors={(k) => submitted || !!touched[k]}
                  serverErrors={serverErrors}
                  running={running}
                  elapsed={elapsed}
                  apiOnline={apiOnline}
                  onField={onField}
                  onMode={onMode}
                  onPreset={onPreset}
                  onForm={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  onRun={() => void run()}
                  onCancel={() => abortRef.current?.abort()}
                />
              </form>
            </Panel>
          </div>
        </div>

        <div className="order-2 min-w-0 space-y-5 lg:order-1 lg:col-span-8">
          {submitted && !validation.ok && (
            <Callout tone="warn" title="Fix the highlighted inputs before running">
              {Object.values(validation.errors).join(' · ')}
            </Callout>
          )}
          {runError && (
            <Callout tone="warn" title={runError.status ? `The API rejected the run (HTTP ${runError.status})` : 'The run could not be completed'}>
              <p>{runError.message}</p>
              {runError.fieldErrors.length > 0 && (
                <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                  {runError.fieldErrors.map((f, i) => (
                    <li key={i}>
                      {f.loc.join('.')}: {f.msg}
                    </li>
                  ))}
                </ul>
              )}
            </Callout>
          )}

          {running && !result && <LoadingBlock height={420} label={`HiGHS solving… ${elapsed.toFixed(1)} s`} />}
          {running && result && (
            <Callout tone="info" title="Solving a new run">
              The results below are from the previous run ({result.run_id}) until the new solution arrives — {elapsed.toFixed(1)} s elapsed.
            </Callout>
          )}
          {result ? (
            <div aria-busy={running} className={running ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <RunResults run={result} />
            </div>
          ) : (
            !running && (
              <Panel title="Results">
                <EmptyState icon={<FlaskConical size={28} />} title="No run yet in this view">
                  Configure a scenario on the right and press <strong className="text-ink">RUN OPTIMIZATION</strong>, or reopen a previous session run from the history below. A 168 h hourly dispatch
                  typically solves in a few seconds.
                </EmptyState>
                <DataLabel className="mt-4" />
              </Panel>
            )
          )}

          <Panel title="Session history" eyebrow="Non-reference runs in the experiment registry" actions={<History size={15} className="text-ink-3" aria-hidden />}>
            {list === null ? (
              <LoadingBlock height={120} label="Loading registry…" />
            ) : history.length === 0 ? (
              <EmptyState title="No session runs yet">Live runs from this lab appear here automatically.</EmptyState>
            ) : (
              <DataTable<ExperimentSummary>
                caption="Session run history"
                dense
                rows={history.slice(0, 25)}
                rowKey={(r) => r.run_id}
                onRowClick={(r) => void loadRun(r.run_id)}
                columns={[
                  {
                    key: 'id',
                    header: 'Run',
                    cell: (r) => (
                      <button type="button" className="text-left font-mono text-xs text-hydro hover:underline" onClick={(e) => { e.stopPropagation(); void loadRun(r.run_id); }}>
                        {loadingId === r.run_id ? 'loading…' : (r.label ?? r.run_id)}
                        {result?.run_id === r.run_id && <span className="ml-1 text-ink-3">(shown)</span>}
                      </button>
                    ),
                  },
                  { key: 'kind', header: 'Mode', cell: (r) => String(r.kind) },
                  { key: 'scen', header: 'Scenario', cell: (r) => (r.scenarios ?? '').split(',').filter(Boolean).map((s) => scenarioLabel(s.trim())).join(', ') || '—' },
                  { key: 'time', header: 'Computed', cell: (r) => <span className="num text-xs text-ink-3">{fmtUtc(r.created_utc)}</span> },
                  { key: 'status', header: 'Status', cell: (r) => <span style={{ color: r.status === 'Optimal' ? 'var(--ok)' : 'var(--caution)' }}>{r.status}</span> },
                  { key: 'obj', header: 'Objective (horizon)', align: 'right', cell: (r) => fmtMEUR(r.objective_keur) },
                ]}
              />
            )}
          </Panel>

          <Panel title="Scenario comparison matrix" eyebrow="Two runs side by side · Δ = B − A">
            <ComparisonMatrix runs={history} />
          </Panel>
        </div>
      </div>
    </Page>
  );
}
