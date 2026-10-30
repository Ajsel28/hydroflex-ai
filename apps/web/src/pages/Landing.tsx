import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BookOpen, FileText, FlaskConical, Gauge, Presentation } from 'lucide-react';
import { paperUrl } from '../api/client';
import { useExperiment } from '../api/hooks';
import { SupportBadge } from '../components/notebook/SummaryCards';
import { REFERENCE_IDS, type RunPayload, type SummaryPayload } from '../api/types';
import { NAV } from '../components/layout/AppShell';
import { LogoMark } from '../components/layout/Logo';
import { FlowHero } from '../components/landing/FlowHero';
import { Badge, Kpi, Skeleton } from '../components/ui/primitives';
import { DataLabel, RunTag } from '../components/ui/run';
import { energyParts, fmtPct, meurParts } from '../lib/format';
import { annualCostKeur, primaryMetrics } from '../lib/run';

const QUESTION =
  'How should a hydropower-dependent electricity system coordinate reservoir operation, renewable generation, battery storage, and electricity imports under uncertain rainfall, fluctuating energy demand, and financial constraints?';

const DESCRIPTIONS: Record<string, string> = {
  '/mission': 'Annual KPIs, dispatch, map and energy flows',
  '/lab': 'Run live drought and investment stress tests',
  '/dispatch': 'Synchronised hourly generation and prices',
  '/storage': 'Reservoir trajectories and battery behaviour',
  '/frontier': 'Cost–import trade-offs of strategies',
  '/risk': 'Stochastic planning, CVaR, sensitivity',
  '/notebook': 'Equations, assumptions, provenance',
  '/about': 'Motivation, limits, references',
  '/present': 'Guided two-minute walkthrough',
};

function ReferenceFacts() {
  const ref = useExperiment<RunPayload>(REFERENCE_IDS.normalAnnual);
  const summary = useExperiment<SummaryPayload>(REFERENCE_IDS.summary);
  const run = ref.data;
  if (ref.loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {run ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Normal year · existing fleet</span>
            <RunTag run={run} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(() => {
              const m = primaryMetrics(run);
              const d = energyParts(m.demand_mwh);
              const imp = energyParts(m.imports_mwh);
              const c = meurParts(annualCostKeur(run));
              return (
                <>
                  <Kpi label="Annual demand" value={d.value} unit={d.unit} tone="hydro" />
                  <Kpi label="Domestic supply share" value={fmtPct(m.domestic_supply_share).replace(' %', '')} unit="%" tone="renew" />
                  <Kpi label="Imports" value={imp.value} unit={imp.unit} tone="neutral" />
                  <Kpi label="Annual system cost" value={c.value} unit="M€/yr" tone="money" />
                </>
              );
            })()}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-3">
          <span className="font-semibold text-ink-2">Reference results pending.</span> The annual reference experiment (<code className="font-mono text-xs">{REFERENCE_IDS.normalAnnual}</code>) has not been generated yet; this page refreshes automatically
          when it appears. Live runs are available now in the Stress Lab.
        </div>
      )}
      {summary.data && summary.data.experiments.length > 0 && (
        <>
        <div className="flex flex-wrap items-center gap-2"><span className="eyebrow">Findings · quoted from ref-summary</span><Link to="/notebook#findings" className="text-xs text-hydro hover:underline">all experiments →</Link></div>
        <ul className="grid gap-3 md:grid-cols-2">
          {summary.data.experiments.filter((e) => e.finding).slice(0, 4).map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-panel-2/50 px-4 py-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">{e.id}</span>
                <SupportBadge supported={e.supported} />
              </div>
              <div className="text-sm font-semibold text-ink">{e.title}</div>
              {e.finding && <p className="mt-1 text-[0.8rem] leading-relaxed text-ink-2">{e.finding}</p>}
            </li>
          ))}
        </ul>
        </>
      )}
      <DataLabel label={run?.data_label ?? summary.data?.data_label} compact />
    </div>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();
  const fade = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } });
  return (
    <div className="blueprint">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
        <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <motion.div {...fade(0)}>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <LogoMark size={36} />
              <Badge tone="hydro">Open-source digital twin · research prototype</Badge>
            </div>
            <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-[3.4rem]">
              HYDROFLEX <span className="text-hydro">AI</span>
            </h1>
            <p className="mt-3 font-serif text-[1.35rem] leading-snug text-ink sm:text-[1.6rem]">Climate Intelligence for Resilient Energy Systems</p>
            <p className="mt-2 text-[0.95rem] text-ink-2">An Open-Source Digital Twin for Climate-Resilient Renewable Electricity Planning</p>
            <blockquote className="mt-6 border-l-2 border-hydro pl-4">
              <div className="eyebrow mb-1.5">Research question</div>
              <p className="font-serif text-[1.08rem] italic leading-relaxed text-ink-2">{QUESTION}</p>
            </blockquote>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <Link to="/mission" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--hydro)] px-5 text-[0.95rem] font-semibold text-[#04121a] hover:brightness-110">
                <Gauge size={17} aria-hidden /> Enter Mission Control <ArrowRight size={16} aria-hidden />
              </Link>
              <Link to="/lab" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-panel-2 px-4 text-sm text-ink hover:border-line-strong">
                <FlaskConical size={16} aria-hidden /> Run a stress test
              </Link>
              <Link to="/present" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-panel-2 px-4 text-sm text-ink hover:border-line-strong">
                <Presentation size={16} aria-hidden /> Presentation mode
              </Link>
              <a href={paperUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm text-ink-2 hover:text-ink">
                <FileText size={16} aria-hidden /> Read the paper
              </a>
            </div>
            <p className="mt-6 text-sm text-ink-3">
              <span className="font-semibold text-ink-2">Ajsel Budlla</span> · Whitman College · Biochemistry, Biophysics and Molecular Biology
            </p>
          </motion.div>
          <motion.div {...fade(0.1)} className="panel p-3 sm:p-5">
            <FlowHero />
            <p className="mt-2 px-1 text-[0.68rem] text-ink-3">Schematic only. Albania’s Drin cascade (Fierza, Koman, Vau i Dejës; 1,350 MW per KESH) provides seasonal storage; solar, wind, batteries and imports complement it.</p>
          </motion.div>
        </section>

        <motion.section {...fade(0.2)} className="panel mt-10 p-5 sm:p-6" aria-labelledby="facts-h">
          <h2 id="facts-h" className="mb-4 font-serif text-xl text-ink">
            Key facts from the reference experiments
          </h2>
          <ReferenceFacts />
        </motion.section>

        <section className="mt-10" aria-labelledby="dir-h">
          <h2 id="dir-h" className="eyebrow mb-3 flex items-center gap-2">
            <BookOpen size={13} aria-hidden /> Explore the platform
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NAV.filter((n) => n.to !== '/').map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="panel group flex items-start gap-3 p-4 transition-colors hover:border-line-strong">
                  <n.icon size={18} className="mt-0.5 text-hydro" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink group-hover:text-hydro">{n.label}</span>
                    <span className="block text-xs text-ink-3">{DESCRIPTIONS[n.to]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
