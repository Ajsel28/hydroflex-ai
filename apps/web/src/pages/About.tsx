import type { ReactNode } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { paperUrl } from '../api/client';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Callout } from '../components/ui/feedback';
import { Panel } from '../components/ui/primitives';
import { DataLabel } from '../components/ui/run';

function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-3 text-[0.95rem] leading-relaxed text-ink-2">{children}</div>;
}

const H = ({ children }: { children: ReactNode }) => <span className="font-serif text-lg font-normal">{children}</span>;

const CAN = [
  'Show, for a transparent and reproducible LP, how reservoir operation, batteries, renewables and imports trade off under stated assumptions.',
  'Compare drought scenarios, investment strategies and risk preferences consistently, with all costs and energies traceable to the solver output.',
  'Quantify marginal values (duals), the value of the stochastic solution and CVaR within the model.',
  'Act as an open, inspectable teaching and research tool for climate-resilient planning in hydropower-dependent systems.',
];
const CANNOT = [
  'Represent the transmission network: it is a single-node (copper-plate) model with one aggregate interconnector — no AC power flow, no line limits.',
  'Use observed demand or market prices: demand and import prices are SYNTHETIC research demonstration data.',
  'Use gauged inflows: reservoir inflows are reconstructed from NASA POWER precipitation with a conceptual rainfall–runoff model.',
  'Claim validation against observed Albanian grid operations — it has not been validated operationally.',
  'Provide bankable cost estimates: technology costs are assumed (IRENA-based with a regional multiplier).',
];

const REFERENCES = [
  'Brown, T., Hörsch, J., & Schlachtberger, D. (2018). PyPSA: Python for Power System Analysis. Journal of Open Research Software, 6(1).',
  'Huangfu, Q., & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. Mathematical Programming Computation, 10, 119–142. (HiGHS)',
  'Rockafellar, R. T., & Uryasev, S. (2000). Optimization of conditional value-at-risk. Journal of Risk, 2(3), 21–41.',
  'NASA Langley Research Center. POWER Project (Prediction Of Worldwide Energy Resources) data access.',
  'IRENA (2025). Renewable Power Generation Costs in 2024. International Renewable Energy Agency, Abu Dhabi.',
  'IRENA (2021). Renewables Readiness Assessment: Albania. International Renewable Energy Agency, Abu Dhabi.',
];

export default function About() {
  return (
    <Page wide={false}>
      <PageHeader
        eyebrow="About"
        title="Why a climate-aware digital twin for Albania"
        lead="HYDROFLEX AI is an open-source research prototype that asks how a hydropower-dependent electricity system can stay reliable and affordable as rainfall becomes less predictable."
      />

      <Callout tone="caution" title="Research prototype — no endorsement, no operational validation">
        This project is not endorsed by IRENA, Whitman College, or Albanian grid operators (including KESH and OST). It has not been validated against observed system operations and must not be used for
        operational or investment decisions.
      </Callout>

      <Panel title={<H>Research motivation</H>}>
        <Prose>
          <p>
            Hydropower-dependent systems are exposed to a risk most planning tools treat as a footnote: a dry year. When inflows fall, the reservoir must ration water across months, imports rise and prices
            follow. The research question is how reservoir operation, renewable generation, battery storage and electricity imports should be coordinated under uncertain rainfall, fluctuating demand and
            financial constraints.
          </p>
        </Prose>
      </Panel>

      <Panel title={<H>Albania’s hydropower-dependent system</H>}>
        <Prose>
          <p>
            Albania’s electricity supply is dominated by hydropower: roughly 95% of installed capacity is hydro, according to IRENA’s Renewables Readiness Assessment (2021). The backbone is the Drin
            cascade of about 1,350 MW operated by KESH — Fierza (500 MW), Koman (600 MW) and Vau i Dejës (250 MW) — complemented by the Devoll cascade and many run-of-river plants.
          </p>
          <p>
            Such a system is low-carbon in a wet year and import-dependent in a dry one. Solar, wind and batteries diversify supply, but their value depends on how they interact with the reservoir’s
            seasonal storage — which is exactly what HYDROFLEX AI models.
          </p>
        </Prose>
      </Panel>

      <Panel title={<H>Methodology</H>}>
        <Prose>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>A native linear program solved with HiGHS: hourly energy balance, reservoir water balance with fixed-head linearisation, run-of-river, PV, wind, battery state of charge, aggregate imports/exports, and penalised unserved energy (VOLL).</li>
            <li>Three modes: dispatch with a fixed fleet; capacity expansion under a capital budget; and two-stage stochastic planning across drought scenarios with a Rockafellar–Uryasev CVaR term.</li>
            <li>Inputs: NASA POWER irradiance, temperature and wind (weather-derived capacity factors), precipitation transformed into a reconstructed inflow index, and synthetic demand and price profiles.</li>
            <li>Cross-checked against an independent PyPSA formulation on test cases and by automated conservation tests.</li>
          </ul>
        </Prose>
      </Panel>

      <Panel title={<H>Contributions</H>}>
        <Prose>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>An open, reproducible digital twin linking climate-driven inflow scenarios to dispatch, investment and risk.</li>
            <li>Explicit comparison of short-duration (battery) and long-duration (reservoir) flexibility in one consistent model.</li>
            <li>Risk-aware planning (CVaR) with the value of the stochastic solution and expected value of perfect information reported alongside.</li>
            <li>An honest interface: every number shown comes from a solver payload, with provenance and data-nature labels always visible.</li>
          </ul>
        </Prose>
      </Panel>

      <Panel title={<H>What the model can and cannot claim</H>}>
        <div className="grid gap-5 md:grid-cols-2">
          <ul className="space-y-2.5">
            {CAN.map((c) => (
              <li key={c} className="flex gap-2.5 text-sm text-ink-2">
                <Check size={15} className="mt-0.5 shrink-0 text-ok" aria-label="Can" />
                {c}
              </li>
            ))}
          </ul>
          <ul className="space-y-2.5">
            {CANNOT.map((c) => (
              <li key={c} className="flex gap-2.5 text-sm text-ink-2">
                <X size={15} className="mt-0.5 shrink-0 text-warn" aria-label="Cannot" />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <DataLabel className="mt-5" />
      </Panel>

      <Panel title={<H>Researcher</H>}>
        <Prose>
          <p>
            <span className="font-semibold text-ink">Ajsel Budlla</span> is a first-year undergraduate researcher at Whitman College (Walla Walla, WA), studying Biochemistry, Biophysics and Molecular
            Biology. Originally from Albania, she has prior computational research experience in neuroscience, environmental remote sensing, numerical simulation, Python and mathematical modelling.
          </p>
        </Prose>
      </Panel>

      <Panel title={<H>References</H>}>
        <ol className="list-decimal space-y-2 pl-5 font-serif text-[0.95rem] leading-relaxed text-ink-2">
          {REFERENCES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </Panel>

      <Panel title={<H>Paper & code</H>}>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a href={paperUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-ink hover:border-line-strong">
            <FileText size={15} aria-hidden /> Download the paper
          </a>
          <span className="text-ink-3">Source code: repository link to be added.</span>
        </div>
      </Panel>
    </Page>
  );
}
