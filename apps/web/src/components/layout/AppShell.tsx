import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  BookOpen,
  ChartScatter,
  FlaskConical,
  Gauge,
  House,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  ShieldAlert,
  Sun,
  Waves,
  X,
} from 'lucide-react';
import { useApp, type SolverState } from '../../state/app';
import { useTheme } from '../../state/theme';
import { ErrorBoundary, Toaster } from '../ui/feedback';
import { cx } from '../ui/primitives';
import { Wordmark } from './Logo';

export const NAV = [
  { to: '/', label: 'Overview', icon: House, end: true },
  { to: '/mission', label: 'Mission Control', icon: Gauge },
  { to: '/lab', label: 'Climate Stress Lab', icon: FlaskConical },
  { to: '/dispatch', label: 'Grid Dispatch', icon: Activity },
  { to: '/storage', label: 'Reservoir & Storage', icon: Waves },
  { to: '/frontier', label: 'Investment Frontier', icon: ChartScatter },
  { to: '/risk', label: 'Risk & Uncertainty', icon: ShieldAlert },
  { to: '/notebook', label: 'Research Notebook', icon: BookOpen },
  { to: '/about', label: 'About', icon: Info },
  { to: '/present', label: 'Presentation', icon: Presentation },
] as const;

const NAV_KEY = 'hydroflex.nav.collapsed';
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_KEY) === '1';
  } catch {
    return false;
  }
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink
            to={n.to}
            end={'end' in n ? n.end : false}
            onClick={onNavigate}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) =>
              cx(
                'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.84rem] transition-colors',
                isActive ? 'bg-panel-3 text-ink' : 'text-ink-3 hover:bg-panel-2 hover:text-ink',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-hydro" />}
                <n.icon size={17} aria-hidden className={isActive ? 'text-hydro' : ''} />
                <span className={collapsed ? 'sr-only' : ''}>{n.label}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

const solverStyle: Record<SolverState, { label: string; color: string }> = {
  idle: { label: 'Solver idle', color: 'var(--ink-3)' },
  running: { label: 'Solver running', color: 'var(--hydro)' },
  optimal: { label: 'Optimal', color: 'var(--ok)' },
  infeasible: { label: 'Not optimal', color: 'var(--caution)' },
  error: { label: 'Run failed', color: 'var(--warn)' },
};

function SolverPill() {
  const { solver, health } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (solver.state !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [solver.state]);
  const busyElsewhere = solver.state === 'idle' && health?.solver_busy;
  const s = busyElsewhere ? { label: 'Server solver busy', color: 'var(--caution)' } : solverStyle[solver.state];
  const elapsed = solver.state === 'running' && solver.startedAt ? ` · ${((now - solver.startedAt) / 1000).toFixed(1)} s` : '';
  return (
    <span
      data-testid="solver-pill"
      role="status"
      aria-live="polite"
      title={solver.detail ?? s.label}
      className="inline-flex h-7 items-center gap-2 rounded-full border px-2.5 font-mono text-[0.68rem]"
      style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 40%, transparent)` }}
    >
      <span className="relative flex h-2 w-2">
        {solver.state === 'running' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: s.color }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      <span className="hidden sm:inline">
        {solver.state === 'optimal' || solver.state === 'infeasible' ? `HiGHS ${solver.detail ?? s.label}` : s.label}
        {elapsed}
      </span>
    </span>
  );
}

function HealthDot() {
  const { apiOnline, health } = useApp();
  const color = apiOnline === null ? 'var(--ink-3)' : apiOnline ? 'var(--ok)' : 'var(--warn)';
  const label = apiOnline === null ? 'Checking API…' : apiOnline ? `API online · v${health?.version ?? '?'} · ${health?.solver ?? ''}` : 'API unreachable';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-ink-3" title={label} role="status" aria-label={label}>
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }} />
      <span className="hidden lg:inline">{apiOnline ? 'API' : apiOnline === false ? 'API offline' : 'API'}</span>
    </span>
  );
}

function ProvenanceBadge() {
  const { dataLabel } = useApp();
  return (
    <span className="group relative min-w-0">
      <button
        type="button"
        className="inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-full border border-[color-mix(in_srgb,var(--caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--caution)_8%,transparent)] px-2.5 font-mono text-[0.66rem] text-caution"
        aria-describedby="prov-tip"
      >
        <span className="truncate">
          <span className="hidden md:inline">Weather-derived + reconstructed + </span>SYNTHETIC demand/prices
        </span>
      </button>
      <span
        id="prov-tip"
        role="tooltip"
        className="pointer-events-none invisible fixed left-4 right-4 top-14 z-50 mt-2 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:w-[min(420px,80vw)] rounded-lg border border-line-strong bg-panel-2 p-3 text-xs leading-relaxed text-ink-2 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="eyebrow mb-1 block">Data provenance</span>
        {dataLabel}
      </span>
    </span>
  );
}

export function TopBarControls() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <HealthDot />
      <SolverPill />
      <button type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 hover:bg-panel-2 hover:text-ink">
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <button
        type="button"
        onClick={() => navigate('/present')}
        className="hidden h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-ink-2 hover:bg-panel-2 hover:text-ink sm:inline-flex"
      >
        <Presentation size={14} aria-hidden />
        Presentation mode
      </button>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const { presentation } = useApp();

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // move focus to main content on route change (screen-reader friendly), and scroll top
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [loc.pathname]);

  const fullBleed = presentation;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a href="#main" className="sr-only z-[100] rounded-lg bg-panel px-3 py-2 text-sm text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      {!fullBleed && (
        <aside
          className={cx('fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-raised transition-[width] duration-200 md:flex', collapsed ? 'w-[68px]' : 'w-[236px]')}
          aria-label="Primary"
        >
          <div className={cx('flex h-14 items-center border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
            <NavLink to="/" aria-label="HYDROFLEX AI home">
              <Wordmark compact={collapsed} />
            </NavLink>
          </div>
          <nav className="scrollbar-thin flex-1 overflow-y-auto p-2.5" aria-label="Main navigation">
            <NavList collapsed={collapsed} />
          </nav>
          <div className="border-t border-line p-2.5">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-3 hover:bg-panel-2 hover:text-ink', collapsed && 'justify-center px-0')}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              {!collapsed && 'Collapse'}
            </button>
            {!collapsed && <p className="mt-2 px-2.5 text-[0.62rem] leading-snug text-ink-3">Research prototype · not an operational tool</p>}
          </div>
        </aside>
      )}

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-[260px] flex-col border-r border-line bg-raised">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Wordmark />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close navigation" className="rounded p-1.5 text-ink-3 hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2.5" aria-label="Main navigation">
              <NavList collapsed={false} onNavigate={() => setDrawer(false)} />
            </nav>
          </div>
        </div>
      )}

      <div className={cx('flex min-h-screen flex-col transition-[padding] duration-200', !fullBleed && (collapsed ? 'md:pl-[68px]' : 'md:pl-[236px]'))}>
        {!fullBleed && (
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] px-3 backdrop-blur sm:px-5">
            <button type="button" className="rounded-lg p-1.5 text-ink-2 hover:bg-panel-2 md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
              <Menu size={18} />
            </button>
            <div className="md:hidden">
              <Wordmark compact />
            </div>
            <div className="min-w-0 flex-1">
              <ProvenanceBadge />
            </div>
            <TopBarControls />
          </header>
        )}
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <ErrorBoundary key={loc.pathname}>{children ?? <Outlet />}</ErrorBoundary>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
