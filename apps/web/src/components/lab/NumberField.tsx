import { useId } from 'react';
import type { FieldSpec } from '../../lib/validation';
import { cx, InfoTip } from '../ui/primitives';

/** Number input (optionally with a slider) showing inline client and server validation messages. */
export function NumberField({
  spec,
  value,
  onChange,
  error,
  serverError,
  placeholder,
  slider = false,
  disabled,
  testId,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  serverError?: string | null;
  placeholder?: string;
  slider?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  const msg = error ?? serverError ?? null;
  const num = Number(value);
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-[0.78rem] font-medium text-ink-2">
          {spec.label}
          {spec.help && <InfoTip text={spec.help} label={`About ${spec.label}`} />}
        </label>
        <span className="num text-[0.65rem] text-ink-3">
          {spec.minExclusive ? '>' : ''}
          {spec.min}…{spec.max.toLocaleString('en-GB')} {spec.unit.length < 8 ? spec.unit : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {slider && (
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={Number.isFinite(num) && value !== '' ? num : spec.min}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label={`${spec.label} slider`}
            className="min-w-0 flex-1"
            tabIndex={-1}
          />
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={spec.step}
          min={spec.min}
          max={spec.max}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={msg ? true : undefined}
          aria-describedby={msg ? `${id}-err` : undefined}
          data-testid={testId}
          className={cx(
            'num h-9 rounded-lg border bg-panel-2 px-2.5 text-sm text-ink placeholder:text-ink-3 hover:border-line-strong',
            slider ? 'w-24 shrink-0' : 'w-full',
            msg ? 'border-[var(--warn)]' : 'border-line',
          )}
        />
      </div>
      {msg && (
        <p id={`${id}-err`} role="alert" className="text-[0.7rem] text-warn">
          {error ?? `Server: ${serverError}`}
        </p>
      )}
    </div>
  );
}
