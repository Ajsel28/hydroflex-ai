import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { Pause, Play } from 'lucide-react';
import type { RunPayload } from '../../api/types';
import { palette } from '../../lib/colors';
import { fmtMW, fmtUtc } from '../../lib/format';
import { maxOf, seriesFor } from '../../lib/run';
import { useTheme } from '../../state/theme';
import geo from './balkans.geo.json';

type Props = { name: string; focus: boolean };
const FC = geo as unknown as FeatureCollection<Geometry, Props>;
const ALBANIA = FC.features.find((f) => f.properties.focus) as Feature<Geometry, Props>;

/** Approximate locations (lat, lon) — illustrative only. */
export const NODES = {
  fierza: { name: 'Fierza HPP', lat: 42.25, lon: 20.04, kind: 'hydro' },
  koman: { name: 'Koman HPP', lat: 42.1, lon: 19.82, kind: 'hydro' },
  vau: { name: 'Vau i Dejës HPP', lat: 42.01, lon: 19.63, kind: 'hydro' },
  devoll: { name: 'Devoll cascade (Banja/Moglicë)', lat: 40.95, lon: 20.25, kind: 'ror' },
  karavasta: { name: 'Karavasta solar (Fier)', lat: 40.92, lon: 19.5, kind: 'solar' },
  tirana: { name: 'Tirana load centre', lat: 41.33, lon: 19.82, kind: 'load' },
  vlore: { name: 'Vlorë', lat: 40.47, lon: 19.49, kind: 'wind' },
} as const;

export const BORDERS = [
  { name: 'Montenegro', lat: 42.2, lon: 19.3 },
  { name: 'Kosovo', lat: 42.2, lon: 20.6 },
  { name: 'North Macedonia', lat: 41.1, lon: 20.75 },
  { name: 'Greece', lat: 40.3, lon: 20.6 },
] as const;

const LABELS = [
  { text: 'MONTENEGRO', lat: 42.62, lon: 19.35 },
  { text: 'KOSOVO', lat: 42.5, lon: 20.75 },
  { text: 'N. MACEDONIA', lat: 41.55, lon: 20.95 },
  { text: 'GREECE', lat: 39.85, lon: 20.75 },
  { text: 'Adriatic Sea', lat: 41.45, lon: 19.05, sea: true },
  { text: 'Ionian Sea', lat: 39.95, lon: 19.45, sea: true },
];

const W = 440;
const H = 600;

export function AlbaniaMap({ run, index, scenario, compact = false }: { run: RunPayload | null; index: number; scenario?: string | null; compact?: boolean }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const proj = useMemo(() => geoMercator().fitExtent([[70, 40], [W - 90, H - 40]], ALBANIA), []);
  const path = useMemo(() => geoPath(proj), [proj]);
  const xy = (lat: number, lon: number) => proj([lon, lat]) ?? [0, 0];
  const s = run ? seriesFor(run, scenario) : null;
  const i = s ? Math.max(0, Math.min(index, s.timestamps.length - 1)) : 0;

  const scale = useMemo(() => {
    if (!s) return 1;
    const S = s.series;
    return Math.max(1, maxOf([...S.hydro, ...S.ror, ...S.pv, ...S.wind, ...S.imports, ...S.exports]) ?? 1);
  }, [s]);
  const width = (v: number | null | undefined) => (v && v > 0.5 ? 1.2 + 9 * Math.sqrt(v / scale) : 0);

  const T = xy(NODES.tirana.lat, NODES.tirana.lon);
  const val = (k: 'hydro' | 'ror' | 'pv' | 'wind' | 'imports' | 'exports' | 'demand' | 'battery_discharge' | 'battery_charge' | 'unserved') => (s ? (s.series[k][i] ?? 0) : null);
  const net = s ? (val('imports') ?? 0) - (val('exports') ?? 0) : null;

  const curve = (a: [number, number], b: [number, number], bend = 0.18) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return `M${a[0]},${a[1]} Q${mx - dy * bend},${my + dx * bend} ${b[0]},${b[1]}`;
  };

  const flows: { id: string; from: [number, number]; v: number | null; color: string; label: string; reverse?: boolean }[] = [
    { id: 'hydro', from: xy(NODES.koman.lat, NODES.koman.lon), v: val('hydro'), color: p.hydro, label: 'Drin cascade (reservoir hydro, aggregate)' },
    { id: 'ror', from: xy(NODES.devoll.lat, NODES.devoll.lon), v: val('ror'), color: p.ror, label: 'Run-of-river (national aggregate, drawn at Devoll)' },
    { id: 'pv', from: xy(NODES.karavasta.lat, NODES.karavasta.lon), v: val('pv'), color: p.solar, label: 'Solar PV (national aggregate)' },
    { id: 'wind', from: xy(NODES.vlore.lat, NODES.vlore.lon), v: val('wind'), color: p.wind, label: 'Wind (national aggregate)' },
  ];

  const sea = theme === 'dark' ? '#081426' : '#e6eef8';
  const land = theme === 'dark' ? '#0d1626' : '#f4f6fa';
  const neighbourStroke = theme === 'dark' ? '#22324d' : '#c4cedc';
  const focusFill = theme === 'dark' ? '#101d33' : '#ffffff';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="map-title map-desc" style={{ maxHeight: compact ? 420 : 560 }}>
      <title id="map-title">Albania — aggregate energy flows{s ? ` at ${fmtUtc(s.timestamps[i])}` : ''}</title>
      <desc id="map-desc">
        Natural Earth outline of Albania and neighbours. Plant markers are approximate, illustrative locations; the model is a single-node system with aggregate interconnection.
      </desc>
      <defs>
        <clipPath id="map-clip">
          <rect width={W} height={H} rx="12" />
        </clipPath>
        <radialGradient id="load-glow">
          <stop offset="0" stopColor={p.money} stopOpacity="0.35" />
          <stop offset="1" stopColor={p.money} stopOpacity="0" />
        </radialGradient>
        <pattern id="sea-lines" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <line x1="0" y1="0" x2="0" y2="10" stroke={theme === 'dark' ? '#0f2140' : '#d4e1f1'} strokeWidth="1" />
        </pattern>
      </defs>
      <g clipPath="url(#map-clip)">
        <rect width={W} height={H} fill={sea} />
        <rect width={W} height={H} fill="url(#sea-lines)" opacity="0.6" />
        {FC.features
          .filter((f) => !f.properties.focus)
          .map((f) => (
            <path key={String(f.id)} d={path(f) ?? ''} fill={land} stroke={neighbourStroke} strokeWidth={0.8} />
          ))}
        <path d={path(ALBANIA) ?? ''} fill={focusFill} stroke={p.hydro} strokeOpacity={0.75} strokeWidth={1.4} />
        {LABELS.map((l) => {
          const [x, y] = xy(l.lat, l.lon);
          return (
            <text key={l.text} x={x} y={y} textAnchor="middle" fontSize={l.sea ? 11 : 9.5} fontStyle={l.sea ? 'italic' : 'normal'} letterSpacing={l.sea ? 0.5 : 1.6} fill={theme === 'dark' ? '#4a5d7c' : '#8a97ab'} fontFamily={l.sea ? 'Newsreader, serif' : 'JetBrains Mono, monospace'}>
              {l.text}
            </text>
          );
        })}

        {/* interconnection corridors — one aggregate value, not allocated by border */}
        {BORDERS.map((b) => {
          const from = xy(b.lat, b.lon);
          const w = width(Math.abs(net ?? 0));
          const importing = (net ?? 0) >= 0;
          return (
            <g key={b.name}>
              <path d={curve(from, T, 0.08)} fill="none" stroke={p.imports} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="2 4" />
              {w > 0 && (
                <path d={curve(from, T, 0.08)} fill="none" stroke={importing ? p.imports : p.exports} strokeWidth={Math.max(1, w / 2)} strokeLinecap="round" className={`flow-line${importing ? '' : ' reverse'}`} opacity={0.9} />
              )}
              <circle cx={from[0]} cy={from[1]} r={3.2} fill={theme === 'dark' ? '#0b1220' : '#fff'} stroke={p.imports} strokeWidth={1.2} />
            </g>
          );
        })}

        {flows.map((f) => {
          const w = width(f.v);
          return (
            <g key={f.id}>
              <path d={curve(f.from, T)} fill="none" stroke={f.color} strokeOpacity={0.18} strokeWidth={1} />
              {w > 0 && <path d={curve(f.from, T)} fill="none" stroke={f.color} strokeWidth={w} strokeLinecap="round" className="flow-line" opacity={0.9}><title>{`${f.label}: ${fmtMW(f.v)}`}</title></path>}
            </g>
          );
        })}

        {/* load centre */}
        <circle cx={T[0]} cy={T[1]} r={26} fill="url(#load-glow)" />
        <circle cx={T[0]} cy={T[1]} r={7} fill={p.money} stroke={theme === 'dark' ? '#060b14' : '#fff'} strokeWidth={2} />
        {s && (val('battery_discharge') ?? 0) + (val('battery_charge') ?? 0) > 0.5 && (
          <circle cx={T[0]} cy={T[1]} r={12} fill="none" stroke={p.battery} strokeWidth={2} strokeDasharray="3 3" className="flow-line">
            <title>Battery (aggregate; location not modelled)</title>
          </circle>
        )}
        {(Object.keys(NODES) as (keyof typeof NODES)[])
          .filter((k) => k !== 'tirana')
          .map((k) => {
            const n = NODES[k];
            const [x, y] = xy(n.lat, n.lon);
            const color = n.kind === 'hydro' ? p.hydro : n.kind === 'ror' ? p.ror : n.kind === 'solar' ? p.solar : p.wind;
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={4.5} fill={color} stroke={theme === 'dark' ? '#060b14' : '#fff'} strokeWidth={1.5} />
                <text x={x + (k === 'vau' || k === 'karavasta' || k === 'vlore' ? -8 : 8)} y={y + 3.5} fontSize={10} textAnchor={k === 'vau' || k === 'karavasta' || k === 'vlore' ? 'end' : 'start'} fill={theme === 'dark' ? '#a9b6ca' : '#39475d'} fontFamily="Manrope, sans-serif">
                  {n.name}
                </text>
              </g>
            );
          })}
        <text x={T[0] + 11} y={T[1] - 9} fontSize={10.5} fontWeight={700} fill={theme === 'dark' ? '#e6edf7' : '#0b1526'} fontFamily="Manrope, sans-serif">
          Tirana load centre
        </text>
        {s && (
          <text x={T[0] + 11} y={T[1] + 4} fontSize={10} fill={p.money} fontFamily="JetBrains Mono, monospace">
            {fmtMW(val('demand'))} demand
          </text>
        )}
      </g>
    </svg>
  );
}

/** Map + time scrubber + legend, with flows read from the run's hourly timeseries. */
export function GridMap({ run, scenario, index, onIndex, compact }: { run: RunPayload | null; scenario?: string | null; index: number; onIndex: (i: number) => void; compact?: boolean }) {
  const { theme } = useTheme();
  const p = palette(theme);
  const s = run ? seriesFor(run, scenario) : null;
  const n = s?.timestamps.length ?? 0;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || n === 0) return;
    const id = window.setInterval(() => onIndex((index + 1) % n), 140);
    return () => window.clearInterval(id);
  }, [playing, n, index, onIndex]);
  const i = Math.min(index, Math.max(0, n - 1));
  const v = (k: 'imports' | 'exports' | 'hydro' | 'pv' | 'wind' | 'ror' | 'unserved') => (s ? s.series[k][i] : null);
  const net = s ? (v('imports') ?? 0) - (v('exports') ?? 0) : null;
  return (
    <div className="flex flex-col gap-3">
      <AlbaniaMap run={run} index={i} scenario={scenario} compact={compact} />
      {s && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPlaying((x) => !x)} aria-label={playing ? 'Pause time playback' : 'Play time playback'} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-ink-2 hover:bg-panel-2">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <input type="range" min={0} max={n - 1} value={i} onChange={(e) => onIndex(Number(e.target.value))} className="w-full" aria-label="Select hour" aria-valuetext={fmtUtc(s.timestamps[i])} />
          <span className="num shrink-0 text-[0.7rem] text-ink-2">{fmtUtc(s.timestamps[i])}</span>
        </div>
      )}
      {s && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {[
            ['Reservoir hydro', v('hydro'), p.hydro],
            ['Run-of-river', v('ror'), p.ror],
            ['Solar', v('pv'), p.solar],
            ['Wind', v('wind'), p.wind],
            [net !== null && net < 0 ? 'Net export' : 'Net import', net !== null ? Math.abs(net) : null, p.imports],
            ['Unserved', v('unserved'), p.unserved],
          ].map(([label, value, color]) => (
            <div key={String(label)} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-3">
                <span className="h-2 w-2 rounded-full" style={{ background: String(color) }} aria-hidden />
                {String(label)}
              </span>
              <span className="num text-ink">{fmtMW(value as number | null)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[0.68rem] leading-relaxed text-ink-3">
        Outline: Natural Earth 1:50m. Markers are <strong className="text-ink-2">approximate locations, illustrative</strong>. Line width ∝ √(MW) of the run’s aggregate dispatch at the selected hour.
        Interconnection is a single <strong className="text-ink-2">aggregate</strong> value (single-node model; not allocated by border, no transmission-line physics).
      </p>
    </div>
  );
}
