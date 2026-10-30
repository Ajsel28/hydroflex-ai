import { useMemo, useState } from 'react';
import type { Data, Layout } from 'plotly.js';
import { ExternalLink, Search } from 'lucide-react';
import type { Assumption, ProfilesResponse, ProvenanceRecord } from '../../api/types';
import { palette } from '../../lib/colors';
import { useTheme } from '../../state/theme';
import { Plot } from '../charts/Plot';
import { toPlotTime } from '../charts/plotTheme';
import { Badge, type Tone } from '../ui/primitives';

/* ---------------- nature badges ---------------- */
type Nature = 'weather-derived' | 'reconstructed' | 'synthetic' | 'reanalysis';
const NATURE_TONE: Record<Nature, Tone> = { 'weather-derived': 'renew', reconstructed: 'hydro', synthetic: 'caution', reanalysis: 'uncertainty' };

export function classifyNature(text: string): Nature[] {
  const t = text.toLowerCase();
  const out: Nature[] = [];
  if (t.includes('synthetic')) out.push('synthetic');
  if (t.includes('reconstructed')) out.push('reconstructed');
  if (t.includes('weather-derived') || t.includes('satellite') || t.includes('not measured power')) out.push('weather-derived');
  if (t.includes('reanalysis')) out.push('reanalysis');
  return out;
}

function NatureBadges({ text }: { text: string }) {
  const n = classifyNature(text);
  return (
    <span className="flex flex-wrap gap-1">
      {n.map((k) => (
        <Badge key={k} tone={NATURE_TONE[k]}>
          {k}
        </Badge>
      ))}
    </span>
  );
}

export function ProvenanceCard({ d }: { d: ProvenanceRecord }) {
  const units = typeof d.units === 'string' ? d.units : Object.entries(d.units).map(([k, v]) => `${k}: ${v}`).join('; ');
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-ink">{d.name}</h3>
        {d.role && <span className="eyebrow shrink-0">{d.role}</span>}
      </div>
      {typeof d.nature === 'string' ? (
        <div className="space-y-1">
          <NatureBadges text={d.nature} />
          <p className="text-xs text-ink-3">{d.nature}</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {Object.entries(d.nature).map(([series, nat]) => (
            <li key={series} className="flex flex-wrap items-center gap-2 text-xs">
              <code className="font-mono text-ink-2">{series}</code>
              <NatureBadges text={nat} />
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink-3">Provider</dt>
        <dd className="text-ink-2">{d.provider}</dd>
        <dt className="text-ink-3">Coverage</dt>
        <dd className="text-ink-2">
          {d.geographic_coverage} · {d.time_coverage} · {d.temporal_resolution}
        </dd>
        <dt className="text-ink-3">Units</dt>
        <dd className="break-words text-ink-2">{units}</dd>
        <dt className="text-ink-3">Accessed</dt>
        <dd className="num text-ink-2">{d.date_accessed}</dd>
        <dt className="text-ink-3">Licence</dt>
        <dd className="text-ink-2">{d.license}</dd>
      </dl>
      <p className="text-xs leading-relaxed text-ink-3">{d.processing}</p>
      {d.source_url?.startsWith('http') && (
        <a href={d.source_url} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs text-hydro hover:underline">
          Source <ExternalLink size={11} aria-hidden />
        </a>
      )}
    </article>
  );
}

/* ---------------- assumptions ---------------- */
export function AssumptionsTable({ rows }: { rows: Assumption[] }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const groups = useMemo(() => ['all', ...Array.from(new Set(rows.map((r) => r.group)))], [rows]);
  const filtered = rows.filter(
    (r) => (group === 'all' || r.group === group) && (q === '' || `${r.parameter} ${r.description ?? ''} ${String(r.value)}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Search assumptions</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search parameter or description…"
            className="h-9 w-full rounded-lg border border-line bg-panel-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink-3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Group</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-ink">
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <span className="num pb-2 text-xs text-ink-3">
          {filtered.length} / {rows.length}
        </span>
      </div>
      <div className="scrollbar-thin max-h-[460px] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Model assumptions</caption>
          <thead className="sticky top-0 bg-panel-2">
            <tr className="text-left">
              <th scope="col" className="eyebrow px-3 py-2 font-normal">Parameter</th>
              <th scope="col" className="eyebrow px-3 py-2 text-right font-normal">Value</th>
              <th scope="col" className="eyebrow px-3 py-2 font-normal">Group</th>
              <th scope="col" className="eyebrow px-3 py-2 font-normal">Description</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.group}.${r.parameter}`} className="border-t border-line">
                <td className="px-3 py-1.5 font-mono text-xs text-ink">{r.parameter}</td>
                <td className="num px-3 py-1.5 text-right text-ink">{String(r.value)}</td>
                <td className="px-3 py-1.5 text-xs text-ink-3">{r.group}</td>
                <td className="px-3 py-1.5 text-xs text-ink-2">{r.description ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- input profiles (small multiples, one axis each) ---------------- */
export function ProfilePlots({ profiles }: { profiles: ProfilesResponse }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const x = useMemo(() => profiles.timestamps.map(toPlotTime), [profiles]);
  const panels: { key: keyof ProfilesResponse['series']; title: string; unit: string; color: string; fmt: string }[] = [
    { key: 'pv_cf', title: 'Solar PV capacity factor (daily mean)', unit: '–', color: p.solar, fmt: '.3f' },
    { key: 'wind_cf', title: 'Wind capacity factor (daily mean)', unit: '–', color: p.wind, fmt: '.3f' },
    { key: 'demand_mw', title: 'Demand (daily mean, SYNTHETIC)', unit: 'MW', color: p.demand, fmt: ',.0f' },
    { key: 'drin_inflow_hm3_per_h', title: 'Drin inflow (reconstructed)', unit: 'hm³/h', color: p.hydro, fmt: '.3f' },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panels.map((pn) => (
        <ProfilePanel key={pn.key} title={pn.title} unit={pn.unit} color={pn.color} fmt={pn.fmt} x={x} y={profiles.series[pn.key]} />
      ))}
    </div>
  );
}

function ProfilePanel({ title, unit, color, fmt, x, y }: { title: string; unit: string; color: string; fmt: string; x: string[]; y: (number | null)[] }) {
  const data = useMemo<Data[]>(() => [{ type: 'scatter', mode: 'lines', x, y, name: title, line: { color, width: 1.4 }, hovertemplate: `%{y:${fmt}} ${unit}<extra></extra>` }], [x, y, color, fmt, unit, title]);
  const layout = useMemo<Partial<Layout>>(() => ({ showlegend: false, margin: { t: 8, b: 32, l: 52, r: 8 }, xaxis: { type: 'date' }, yaxis: { title: { text: unit }, tickformat: fmt } }), [unit, fmt]);
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1 text-xs font-semibold text-ink-2">{title}</div>
      <Plot data={data} layout={layout} height={190} ariaLabel={title} filename={title.replace(/\W+/g, '-').toLowerCase()} />
    </div>
  );
}
