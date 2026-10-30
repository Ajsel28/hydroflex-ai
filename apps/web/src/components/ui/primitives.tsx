import { type ButtonHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';
import { Info } from 'lucide-react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/* ---------------- Panel ---------------- */
export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  const hid = useId();
  return (
    <section className={cx('panel min-w-0', className)} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || actions || eyebrow) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && (
              <h2 id={hid} className="text-[0.95rem] font-semibold tracking-tight text-ink">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode }>(
  function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }, ref) {
    const v: Record<Variant, string> = {
      primary:
        'bg-[var(--hydro)] text-[#04121a] hover:brightness-110 border border-transparent font-semibold shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_8px_24px_-12px_rgba(34,211,238,0.6)]',
      secondary: 'bg-panel-2 text-ink border border-line hover:border-line-strong hover:bg-panel-3',
      ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-panel-2 hover:text-ink',
      danger: 'bg-transparent text-warn border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--warn)_12%,transparent)]',
    };
    const s = { sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg', md: 'h-9 px-3.5 text-sm gap-2 rounded-lg', lg: 'h-11 px-5 text-[0.95rem] gap-2.5 rounded-xl' }[size];
    return (
      <button
        ref={ref}
        type={type}
        className={cx('inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50', v[variant], s, className)}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);

/* ---------------- Badge ---------------- */
export type Tone = 'neutral' | 'hydro' | 'renew' | 'money' | 'uncertainty' | 'warn' | 'ok' | 'caution';
const toneVar: Record<Tone, string> = {
  neutral: 'var(--ink-3)',
  hydro: 'var(--hydro)',
  renew: 'var(--renew)',
  money: 'var(--money)',
  uncertainty: 'var(--uncertainty)',
  warn: 'var(--warn)',
  ok: 'var(--ok)',
  caution: 'var(--caution)',
};
export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  const c = toneVar[tone];
  return (
    <span
      title={title}
      className={cx('inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.68rem] tracking-wide', className)}
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 9%, transparent)` }}
    >
      {children}
    </span>
  );
}

/* ---------------- KPI tile ---------------- */
export function Kpi({
  label,
  value,
  unit,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden px-4 py-3.5">
      <span aria-hidden className="absolute inset-y-3 left-0 w-[2px] rounded-full" style={{ background: toneVar[tone] }} />
      <div className="flex items-center justify-between gap-2">
        <div className="eyebrow truncate">{label}</div>
        {icon && <span className="text-ink-3" aria-hidden>{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cx('num font-medium leading-none text-ink', /^[-−+]?[\d.,]+$|^—$/.test(value) ? 'text-[1.6rem]' : 'text-[1.05rem] leading-tight')}>{value}</span>
        {unit && value !== '—' && <span className="num text-xs text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

/* ---------------- Skeleton / Empty ---------------- */
export function Skeleton({ className, height }: { className?: string; height?: number }) {
  return <div aria-hidden className={cx('skeleton', className)} style={height ? { height } : undefined} />;
}

export function LoadingBlock({ label = 'Loading…', height = 280 }: { label?: string; height?: number }) {
  return (
    <div role="status" aria-live="polite" className="relative">
      <Skeleton height={height} className="w-full" />
      <span className="absolute inset-0 grid place-items-center font-mono text-xs text-ink-3">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="blueprint flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3" aria-hidden>{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-prose text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------- Info tooltip ---------------- */
export function InfoTip({ text, label = 'More information' }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} className="rounded text-ink-3 hover:text-ink">
        <Info size={13} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-line-strong bg-panel-2 p-3 text-left text-xs leading-relaxed text-ink-2 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-md font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-[0.8rem]',
              active ? 'bg-panel-3 text-ink shadow-sm ring-1 ring-line-strong' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Select ---------------- */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'eyebrow'}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 min-w-0 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink hover:border-line-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------- Stat row (label/value pairs) ---------------- */
export function StatList({ items, className }: { items: { label: ReactNode; value: ReactNode; title?: string }[]; className?: string }) {
  return (
    <dl className={cx('divide-y divide-line text-sm', className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-1.5" title={it.title}>
          <dt className="text-ink-3">{it.label}</dt>
          <dd className="num text-right text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-[3px] w-4 rounded-full" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
