import { useMemo } from 'react';
import { FileText, FolderGit2 } from 'lucide-react';
import { api, paperUrl } from '../api/client';
import { useAsync, useExperiment, useExperimentList } from '../api/hooks';
import { REFERENCE_IDS, isRunPayload, type StoredExperiment } from '../api/types';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { RunSelector, useRunParam } from '../components/layout/RunSelector';
import { AssumptionsTable, ProfilePlots, ProvenanceCard } from '../components/notebook/NotebookParts';
import { TeX } from '../components/notebook/TeX';
import { SummaryCards } from '../components/notebook/SummaryCards';
import { ChronoCheckPanel, CrossCheckPanel } from '../components/frontier/ValidationPanels';
import { Callout } from '../components/ui/feedback';
import { Badge, EmptyState, LoadingBlock, Panel, StatList } from '../components/ui/primitives';
import { DataLabel, DownloadButtons, RunTag, SolverDiagnostics, Warnings } from '../components/ui/run';
import { fmtInt, fmtKEUR, fmtUtc, scenarioLabel, titleCase } from '../lib/format';
import { useApp } from '../state/app';

function Unavailable({ what, error }: { what: string; error?: string | null }) {
  return (
    <EmptyState title={`${what} unavailable`}>
      {error ?? 'The API did not return this resource.'} Check that the API is running at the configured base URL.
    </EmptyState>
  );
}

function Equations() {
  const meta = useAsync(() => api.metadata(), 'metadata');
  if (meta.loading) return <LoadingBlock label="Loading model metadata…" height={300} />;
  if (!meta.data) return <Unavailable what="Model metadata" error={meta.error?.message} />;
  const m = meta.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone="hydro">
          {m.name} v{m.version}
        </Badge>
        <Badge tone="neutral">{m.network}</Badge>
      </div>
      <p className="font-serif text-lg leading-snug text-ink">{m.title}</p>
      <ol className="space-y-4">
        {m.equations.map((e, i) => (
          <li key={e.id} id={`eq-${e.id}`} className="rounded-xl border border-line bg-panel-2/40 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-[1.05rem] text-ink">{e.title}</h3>
              <span className="num text-xs text-ink-3">({i + 1})</span>
            </div>
            <TeX latex={e.latex} className="my-2" />
            <p className="text-[0.8rem] leading-relaxed text-ink-2">{e.description}</p>
          </li>
        ))}
      </ol>
      <details className="rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Full formulation (plain text)</summary>
        <pre className="scrollbar-thin mt-3 overflow-x-auto whitespace-pre font-mono text-[0.72rem] leading-relaxed text-ink-2">{m.formulation}</pre>
      </details>
      <div className="grid gap-4 md:grid-cols-2">
        <Callout tone="ok" title="Validation status">
          {m.validation_status}
        </Callout>
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="eyebrow mb-2">Problem-size limits (time steps)</div>
          <StatList items={Object.entries(m.limits).map(([k, v]) => ({ label: titleCase(k), value: fmtInt(v) }))} />
        </div>
      </div>
      <Panel title="Assumptions" eyebrow={`${m.assumptions.length} parameters`} className="!shadow-none">
        <AssumptionsTable rows={m.assumptions} />
      </Panel>
    </div>
  );
}

function Provenance() {
  const src = useAsync(() => api.sources(), 'sources');
  if (src.loading) return <LoadingBlock label="Loading data sources…" height={220} />;
  if (!src.data) return <Unavailable what="Data sources" error={src.error?.message} />;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {src.data.datasets.map((d, i) => (
        <ProvenanceCard key={d.dataset_id ?? `${d.name}-${i}`} d={d} />
      ))}
    </div>
  );
}

function Profiles() {
  const prof = useAsync(() => api.profiles(0, 365, 24), 'profiles-0-365-24');
  if (prof.loading) return <LoadingBlock label="Loading input profiles…" height={260} />;
  if (!prof.data) return <Unavailable what="Input profiles" error={prof.error?.message} />;
  return (
    <div className="space-y-3">
      <ProfilePlots profiles={prof.data} />
      <p className="text-xs text-ink-3">
        Data mode: <code className="font-mono">{prof.data.data_mode}</code>. Daily means of the hourly model inputs for the reference year.
      </p>
    </div>
  );
}

function Registry() {
  const { registryVersion } = useApp();
  const { list, error } = useExperimentList(30_000, registryVersion);
  if (!list && !error) return <LoadingBlock label="Loading experiment registry…" height={200} />;
  if (!list) return <Unavailable what="Experiment registry" error={error?.message} />;
  if (list.length === 0) return <EmptyState title="No experiments yet">Reference experiments are being generated; live runs from the Stress Lab will also appear here.</EmptyState>;
  return (
    <div className="scrollbar-thin max-h-[520px] overflow-auto rounded-lg border border-line">
      <table className="w-full min-w-[820px] text-sm">
        <caption className="sr-only">Experiment registry</caption>
        <thead className="sticky top-0 bg-panel-2">
          <tr className="text-left">
            {['Run id', 'Kind', 'Type', 'Scenarios', 'Created', 'Status', 'Objective', 'Downloads'].map((h) => (
              <th key={h} scope="col" className={`eyebrow px-3 py-2 font-normal ${h === 'Objective' ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((e) => (
            <tr key={e.run_id} className="border-t border-line align-middle">
              <td className="px-3 py-1.5 font-mono text-xs text-ink">{e.run_id}</td>
              <td className="px-3 py-1.5 text-xs text-ink-2">{e.kind}</td>
              <td className="px-3 py-1.5">{e.reference ? <Badge tone="uncertainty">reference</Badge> : <Badge tone="ok">session</Badge>}</td>
              <td className="px-3 py-1.5 text-xs text-ink-2">{e.scenarios ? e.scenarios.split(',').map((s) => scenarioLabel(s.trim())).join(', ') : '—'}</td>
              <td className="num px-3 py-1.5 text-xs text-ink-3">{fmtUtc(e.created_utc)}</td>
              <td className="px-3 py-1.5 text-xs text-ink-2">{e.status}</td>
              <td className="num px-3 py-1.5 text-right text-xs">{fmtKEUR(e.objective_keur)}</td>
              <td className="px-3 py-1.5">
                <DownloadButtons runId={e.run_id} formats={['json', 'csv']} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Diagnostics() {
  const [id, setId] = useRunParam(REFERENCE_IDS.normalAnnual);
  const exp = useExperiment<StoredExperiment>(id);
  const run = exp.data && isRunPayload(exp.data) ? exp.data : null;
  const execution = useMemo(() => (run?.execution ? Object.entries(run.execution) : []), [run]);
  return (
    <div className="space-y-4">
      <RunSelector value={id} onChange={setId} />
      {exp.loading && <LoadingBlock label="Loading run…" height={200} />}
      {!exp.loading && !run && (
        <EmptyState title="Run not available yet">
          <code className="font-mono text-xs">{id}</code> could not be loaded{exp.error ? ` (${exp.error.message})` : ''}. Select another run; reference artefacts appear automatically once computed.
        </EmptyState>
      )}
      {run && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <RunTag run={run} />
            <SolverDiagnostics solver={run.solver} run={run} />
          </div>
          <div className="space-y-3">
            <div className="eyebrow">Execution environment</div>
            <StatList items={execution.map(([k, v]) => ({ label: k, value: String(v) }))} />
            <div className="eyebrow pt-2">Provenance datasets</div>
            <div className="flex flex-wrap gap-1.5">
              {run.provenance.map((p) => (
                <code key={p} className="rounded border border-line px-1.5 py-0.5 font-mono text-[0.66rem] text-ink-2">
                  {p}
                </code>
              ))}
            </div>
            <Warnings warnings={run.warnings} />
            <DownloadButtons runId={run.run_id} />
          </div>
          <DataLabel label={run.data_label} className="lg:col-span-2" />
        </div>
      )}
    </div>
  );
}

const SECTIONS = [
  ['equations', 'Model & equations'],
  ['findings', 'Experiment findings'],
  ['validation', 'Validation'],
  ['profiles', 'Input profiles'],
  ['provenance', 'Data provenance'],
  ['registry', 'Experiment registry'],
  ['diagnostics', 'Solver diagnostics'],
  ['paper', 'Paper & repository'],
] as const;

export default function Notebook() {
  return (
    <Page>
      <PageHeader
        eyebrow="Research Notebook"
        title="Equations, assumptions and provenance"
        lead="Everything needed to audit a result: the LP formulation, every parameter, where each input comes from, and what the solver actually did."
        actions={
          <a href={paperUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-sm text-ink hover:border-line-strong">
            <FileText size={15} aria-hidden /> Paper
          </a>
        }
      />
      <nav aria-label="Notebook sections" className="flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-line-strong hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <Panel id="equations" title={<span className="font-serif text-lg font-normal">Model formulation</span>} eyebrow="Served by /api/model/metadata">
        <Equations />
      </Panel>
      <Panel id="findings" title={<span className="font-serif text-lg font-normal">Experiment findings</span>} eyebrow="ref-summary · hypothesis → finding">
        <SummaryCards />
      </Panel>
      <section id="validation" aria-label="Validation" className="space-y-5">
        <CrossCheckPanel />
        <ChronoCheckPanel />
      </section>
      <Panel id="profiles" title={<span className="font-serif text-lg font-normal">Input profiles</span>} eyebrow="Daily means · /api/data/profiles">
        <Profiles />
      </Panel>
      <Panel id="provenance" title={<span className="font-serif text-lg font-normal">Data provenance</span>} eyebrow="/api/data/sources">
        <Provenance />
      </Panel>
      <Panel id="registry" title={<span className="font-serif text-lg font-normal">Experiment registry</span>} eyebrow="/api/experiments">
        <Registry />
      </Panel>
      <Panel id="diagnostics" title={<span className="font-serif text-lg font-normal">Solver diagnostics</span>} eyebrow="Selected run">
        <Diagnostics />
      </Panel>
      <Panel id="paper" title={<span className="font-serif text-lg font-normal">Paper & repository</span>}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm text-ink-2">
            <p>The paper is served by the API: a compiled PDF if available, otherwise the LaTeX source.</p>
            <a href={paperUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-hydro hover:underline">
              <FileText size={14} aria-hidden /> Download paper (/api/paper)
            </a>
          </div>
          <div className="space-y-2 text-sm text-ink-2">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <FolderGit2 size={15} aria-hidden /> Repository files
            </div>
            <ul className="space-y-1 font-mono text-xs">
              <li>
                <code>experiments/</code> — reference experiment artefacts
              </li>
              <li>
                <code>research/paper/main.tex</code> — paper source
              </li>
              <li>
                <code>docs/API_CONTRACT.md</code>, <code>docs/equations.json</code>
              </li>
            </ul>
            <p className="text-xs text-ink-3">Repository link to be added.</p>
          </div>
        </div>
      </Panel>
    </Page>
  );
}
