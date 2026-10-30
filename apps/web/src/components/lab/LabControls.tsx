import { useId, type ReactNode } from 'react';
import { CloudRain, Coins, Cpu, Play, Square, Zap } from 'lucide-react';
import type { ScenarioSpec } from '../../api/types';
import { fmtNum } from '../../lib/format';
import { FIELDS, LIMITS, SCENARIO_FIELDS, SYSTEM_FIELDS, usesHorizon, type FieldKey, type LabForm, type LabMode, type Validation } from '../../lib/validation';
import { Callout } from '../ui/feedback';
import { Button, Segmented, Select } from '../ui/primitives';
import { NumberField } from './NumberField';

export const HORIZON_PRESETS = [
  { value: '48@1', label: '48 h · hourly', hours: 48, res: 1 },
  { value: '168@1', label: '1 week · hourly (168 h)', hours: 168, res: 1 },
  { value: '720@1', label: '30 days · hourly (720 h)', hours: 720, res: 1 },
  { value: '2160@3', label: '90 days · 3-hourly', hours: 2160, res: 3 },
  { value: '8760@3', label: 'Full year · 3-hourly (8760 h)', hours: 8760, res: 3, year: true },
  { value: '8760@6', label: 'Full year · 6-hourly (8760 h)', hours: 8760, res: 6, year: true },
] as const;

function Group({ icon, title, children, note }: { icon: ReactNode; title: string; children: ReactNode; note?: ReactNode }) {
  const id = useId();
  return (
    <fieldset className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0" aria-labelledby={id}>
      <legend id={id} className="flex items-center gap-2 text-[0.8rem] font-semibold text-ink">
        <span className="text-ink-3" aria-hidden>
          {icon}
        </span>
        {title}
      </legend>
      {note && <p className="text-[0.72rem] leading-relaxed text-ink-3">{note}</p>}
      {children}
    </fieldset>
  );
}

export interface LabControlsProps {
  form: LabForm;
  presets: ScenarioSpec[] | null;
  presetsError: string | null;
  nStochastic: number;
  defaults: Partial<Record<FieldKey, number>>;
  validation: Validation;
  showErrors: (k: FieldKey) => boolean;
  serverErrors: Partial<Record<FieldKey, string>>;
  running: boolean;
  elapsed: number;
  apiOnline: boolean | null;
  onField: (k: FieldKey, v: string) => void;
  onMode: (m: LabMode) => void;
  onPreset: (key: string) => void;
  onForm: (patch: Partial<LabForm>) => void;
  onRun: () => void;
  onCancel: () => void;
}

export function LabControls(p: LabControlsProps) {
  const { form, validation, presets } = p;
  const field = (k: FieldKey, extra: { slider?: boolean; testId?: string; disabled?: boolean } = {}) => (
    <NumberField
      key={k}
      spec={FIELDS[k]}
      value={form[k]}
      onChange={(v) => p.onField(k, v)}
      error={p.showErrors(k) ? (validation.errors[k] ?? null) : null}
      serverError={p.serverErrors[k] ?? null}
      placeholder={p.defaults[k] !== undefined ? `default ${fmtNum(p.defaults[k], 0)}` : 'model default'}
      slider={extra.slider}
      testId={extra.testId}
      disabled={extra.disabled || p.running}
    />
  );
  const horizonPreset = HORIZON_PRESETS.find((h) => String(h.hours) === form.hours && String(h.res) === form.resolution_h)?.value ?? 'custom';
  const scenarioDisabled = form.mode === 'stochastic';
  const horizonUsed = usesHorizon(form);
  const presetSpec = presets?.find((s) => s.key === form.preset);

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow mb-2">Optimisation mode</div>
        <Segmented<LabMode>
          label="Optimisation mode"
          value={form.mode}
          onChange={p.onMode}
          options={[
            { value: 'simulate', label: 'Dispatch (fixed fleet)', disabled: p.running },
            { value: 'investment', label: 'Optimise investments', disabled: p.running },
            { value: 'stochastic', label: 'Stochastic + CVaR', disabled: p.running },
          ]}
        />
        <p className="mt-2 text-[0.72rem] leading-relaxed text-ink-3">
          {form.mode === 'simulate' && 'POST /api/simulate — least-cost hourly dispatch of the given fleet (LP, HiGHS).'}
          {form.mode === 'investment' && `POST /api/optimize/investments — chooses PV, wind and battery additions under the capital budget. Limited to ${LIMITS.investment} time steps.`}
          {form.mode === 'stochastic' &&
            `POST /api/optimize/stochastic — one first-stage plan for ${p.nStochastic} weighted inflow/price scenarios, with a CVaR risk term. Scenario presets are replaced by the stochastic set.`}
        </p>
      </div>

      <Group icon={<CloudRain size={15} />} title="Climate & market scenario" note={scenarioDisabled ? 'Not used in stochastic mode: the backend’s probability-weighted scenario set (wet → compound shock) is optimised jointly.' : undefined}>
        <Select
          label="Preset"
          value={form.preset}
          onChange={p.onPreset}
          options={(presets ?? [{ key: form.preset, label: form.preset } as ScenarioSpec]).map((s) => ({ value: s.key, label: s.label }))}
        />
        {p.presetsError && <p className="text-[0.72rem] text-warn">Presets unavailable ({p.presetsError}); scenario values cannot be pre-filled.</p>}
        {presetSpec && !scenarioDisabled && <p className="text-[0.72rem] leading-relaxed text-ink-3">{presetSpec.description} Edit any value below to create a custom override.</p>}
        {SCENARIO_FIELDS.map((k) => field(k, { slider: true, disabled: scenarioDisabled }))}
      </Group>

      <Group icon={<Zap size={15} />} title="System configuration" note="Total installed capacities. Leave blank to keep the documented model default.">
        <div className="grid grid-cols-2 gap-3">{SYSTEM_FIELDS.slice(0, 4).map((k) => field(k))}</div>
        {SYSTEM_FIELDS.slice(4).map((k) => field(k))}
      </Group>

      {form.mode !== 'simulate' && (
        <Group icon={<Coins size={15} />} title={form.mode === 'stochastic' ? 'Budget & risk' : 'Capital budget'}>
          {field('budget_meur')}
          {form.mode === 'stochastic' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {field('risk_lambda')}
                {field('risk_alpha')}
              </div>
              <Select<'representative_weeks' | 'annual_chronological'>
                label="Stochastic method"
                value={form.method}
                onChange={(v) => p.onForm({ method: v })}
                options={[
                  { value: 'representative_weeks', label: 'Representative weeks (annualised metrics)' },
                  { value: 'annual_chronological', label: 'Annual chronological (uses horizon below)' },
                ]}
              />
              {form.method === 'representative_weeks' && (
                <Segmented<'4' | '8'>
                  label="Representative weeks per scenario"
                  value={String(form.n_weeks) as '4' | '8'}
                  onChange={(v) => p.onForm({ n_weeks: Number(v) as 4 | 8 })}
                  size="sm"
                  options={[
                    { value: '4', label: '4 weeks / scenario' },
                    { value: '8', label: '8 weeks / scenario' },
                  ]}
                />
              )}
              <label className="flex items-start gap-2 text-[0.78rem] text-ink-2">
                <input type="checkbox" checked={form.compare} onChange={(e) => p.onForm({ compare: e.target.checked })} disabled={p.running} className="mt-0.5 accent-[var(--hydro)]" />
                <span>
                  Compare with the deterministic (expected-value) plan — computes VSS and EVPI. <span className="text-ink-3">Untick for a faster run.</span>
                </span>
              </label>
            </>
          )}
        </Group>
      )}

      <Group icon={<Cpu size={15} />} title="Horizon" note={!horizonUsed ? `Not used: representative-weeks mode solves ${form.n_weeks} hourly weeks per scenario (${168 * form.n_weeks} steps).` : undefined}>
        <Select
          label="Horizon preset"
          value={horizonPreset}
          onChange={(v) => {
            const h = HORIZON_PRESETS.find((x) => x.value === v);
            if (h) p.onForm({ hours: String(h.hours), resolution_h: String(h.res), ...('year' in h && h.year ? { start_day: '0' } : {}) });
          }}
          options={[...HORIZON_PRESETS.map((h) => ({ value: h.value, label: h.label })), ...(horizonPreset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]}
        />
        <div className="grid grid-cols-2 gap-3">
          {field('hours', { testId: 'lab-hours', disabled: !horizonUsed })}
          {field('start_day', { disabled: !horizonUsed })}
        </div>
        <Select
          label="Time step"
          value={form.resolution_h}
          onChange={(v) => p.onField('resolution_h', v)}
          options={['1', '2', '3', '6'].map((r) => ({ value: r, label: `${r} h` }))}
        />
        {p.showErrors('resolution_h') && validation.errors.resolution_h && <p className="text-[0.7rem] text-warn">{validation.errors.resolution_h}</p>}
        <p className="num text-[0.7rem] text-ink-3">
          {validation.steps !== null ? `${fmtNum(validation.steps, 0)} time steps` : '—'}
          {form.mode === 'investment' ? ` · limit ${LIMITS.investment}` : ''}
          {form.mode === 'stochastic' && validation.steps !== null ? ` × ${p.nStochastic} scenarios = ${fmtNum(validation.steps * p.nStochastic, 0)} (limit ${LIMITS.stochastic_total})` : ''}
        </p>
      </Group>

      <div className="space-y-1 border-t border-line pt-4">
        <label htmlFor="lab-label" className="eyebrow">
          Run label (optional)
        </label>
        <input
          id="lab-label"
          value={form.label}
          maxLength={120}
          onChange={(e) => p.onForm({ label: e.target.value })}
          placeholder="e.g. Severe drought + 300 MW battery"
          className="h-9 w-full rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink placeholder:text-ink-3"
        />
      </div>

      {form.mode === 'stochastic' && (
        <Callout tone="uncertainty" title="Long-running solve">
          A two-stage stochastic run with {p.nStochastic} scenarios typically takes about a minute{form.compare ? ', and 1–3 minutes with the deterministic comparison' : ''}. The CPU is shared; you can cancel at any time.
        </Callout>
      )}
      {p.apiOnline === false && <Callout tone="warn">The API is unreachable, so no optimisation can be run right now. Reference experiments remain viewable on the other pages.</Callout>}

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-line bg-panel px-4 py-3 sm:-mx-5 sm:px-5">
        {p.running ? (
          <>
            <div className="flex flex-1 items-center gap-2 font-mono text-xs text-hydro" role="status" aria-live="polite">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-hydro opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-hydro" />
              </span>
              HiGHS solving… {p.elapsed.toFixed(1)} s
            </div>
            <Button variant="danger" onClick={p.onCancel} icon={<Square size={13} />}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" className="w-full" onClick={p.onRun} icon={<Play size={15} />} data-testid="lab-run-button" disabled={p.apiOnline === false}>
            RUN OPTIMIZATION
          </Button>
        )}
      </div>
    </div>
  );
}
