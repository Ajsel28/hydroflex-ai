import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useToast, type ToastTone } from '../../state/toast';
import { cx } from './primitives';

/* ---------------- Error boundary ---------------- */
export class ErrorBoundary extends Component<{ children: ReactNode; fallbackTitle?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HydroFlex UI error', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="panel m-4 border-[color-mix(in_srgb,var(--warn)_40%,transparent)] p-6">
          <div className="flex items-center gap-2 text-warn">
            <AlertTriangle size={18} aria-hidden />
            <h2 className="font-semibold">{this.props.fallbackTitle ?? 'This view failed to render'}</h2>
          </div>
          <p className="mt-2 font-mono text-xs text-ink-3">{this.state.error.message}</p>
          <button type="button" className="mt-4 rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-panel-2" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Toasts ---------------- */
const toneIcon: Record<ToastTone, ReactNode> = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <XCircle size={16} />,
};
const toneColor: Record<ToastTone, string> = { info: 'var(--hydro)', success: 'var(--ok)', warning: 'var(--caution)', error: 'var(--warn)' };

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const reduce = useReducedMotion();
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.18 }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="panel pointer-events-auto flex items-start gap-3 p-3 pr-2"
          >
            <span style={{ color: toneColor[t.tone] }} className="mt-0.5" aria-hidden>
              {toneIcon[t.tone]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.detail && <div className="mt-0.5 break-words text-xs text-ink-3">{t.detail}</div>}
            </div>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="rounded p-1 text-ink-3 hover:text-ink">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Drawer (right) ---------------- */
export function Drawer({ open, onClose, title, children, width = 460 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => ref.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-y-0 right-0 z-[70] flex max-w-full flex-col border-l border-line bg-raised shadow-2xl outline-none"
            style={{ width }}
            initial={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-semibold text-ink">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close panel" className="rounded p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Callout ---------------- */
export function Callout({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'ok' | 'caution' | 'uncertainty'; title?: ReactNode; children: ReactNode; className?: string }) {
  const c = { info: 'var(--hydro)', warn: 'var(--warn)', ok: 'var(--ok)', caution: 'var(--caution)', uncertainty: 'var(--uncertainty)' }[tone];
  return (
    <div
      className={cx('rounded-xl border px-4 py-3 text-sm', className)}
      style={{ borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 7%, transparent)` }}
    >
      {title && <div className="mb-1 font-semibold" style={{ color: c }}>{title}</div>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}
