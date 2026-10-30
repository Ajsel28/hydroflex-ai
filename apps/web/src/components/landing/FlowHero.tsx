import { useReducedMotion } from 'motion/react';

/**
 * Decorative, original energy-flow illustration: rainfall → reservoir → turbine → grid node,
 * with solar, wind, battery and interconnector feeders. Purely schematic; carries no data.
 */
export function FlowHero() {
  const reduce = useReducedMotion();
  const cls = reduce ? '' : 'flow-line';
  return (
    <svg viewBox="0 0 560 360" className="h-auto w-full" aria-hidden focusable="false">
      <defs>
        <linearGradient id="fh-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--hydro)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.08" />
        </linearGradient>
        <radialGradient id="fh-node">
          <stop offset="0" stopColor="var(--money)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--money)" stopOpacity="0" />
        </radialGradient>
        <pattern id="fh-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="var(--line)" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="560" height="360" rx="18" fill="url(#fh-grid)" opacity="0.7" />

      {/* rain */}
      {[40, 70, 100, 130, 160].map((x, i) => (
        <line key={x} x1={x} y1={34 + (i % 2) * 8} x2={x - 6} y2={58 + (i % 2) * 8} stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      <path d="M28 30c0-14 18-20 28-12 6-14 32-14 38 2 14-8 32 0 30 14 16 0 22 18 8 22H40c-14 0-20-18-12-26Z" fill="var(--panel-3)" stroke="var(--line-strong)" />

      {/* mountains + reservoir */}
      <path d="M0 230 L70 140 L120 190 L170 120 L240 230 Z" fill="var(--panel-2)" stroke="var(--line-strong)" strokeWidth="0.8" />
      <path d="M40 230 C70 214 110 214 150 222 L196 230 Z" fill="url(#fh-water)" />
      <path d="M48 222c10 0 10-4 20-4s10 4 20 4 10-4 20-4 10 4 20 4 10-4 20-4" fill="none" stroke="var(--hydro)" strokeWidth="1.6" strokeLinecap="round" className={cls} />
      {/* dam */}
      <path d="M196 196 L206 196 L212 236 L190 236 Z" fill="var(--ink-3)" opacity="0.6" />
      <text x="58" y="252" fontSize="10" fill="var(--ink-3)" fontFamily="JetBrains Mono, monospace">reservoir · seasonal storage</text>

      {/* hydro feeder */}
      <path d="M212 226 C260 226 290 190 330 182" fill="none" stroke="var(--hydro)" strokeWidth="3" strokeLinecap="round" className={cls} />

      {/* solar */}
      <g transform="translate(250 60)">
        <circle cx="0" cy="0" r="10" fill="none" stroke="var(--solar)" strokeWidth="1.6" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={Math.cos((a * Math.PI) / 180) * 14} y1={Math.sin((a * Math.PI) / 180) * 14} x2={Math.cos((a * Math.PI) / 180) * 19} y2={Math.sin((a * Math.PI) / 180) * 19} stroke="var(--solar)" strokeWidth="1.4" strokeLinecap="round" />
        ))}
        <path d="M-22 44 L22 44 L30 60 L-14 60 Z" fill="none" stroke="var(--solar)" strokeWidth="1.3" />
        <line x1="4" y1="44" x2="8" y2="60" stroke="var(--solar)" strokeWidth="0.8" />
      </g>
      <path d="M268 118 C292 140 312 160 330 176" fill="none" stroke="var(--solar)" strokeWidth="2.2" strokeLinecap="round" className={cls} />

      {/* wind */}
      <g transform="translate(420 70)">
        <line x1="0" y1="0" x2="0" y2="56" stroke="var(--wind)" strokeWidth="1.6" />
        <g className={reduce ? '' : 'origin-center'} style={reduce ? undefined : { transformBox: 'fill-box', transformOrigin: 'center', animation: 'spin 9s linear infinite' }}>
          <path d="M0 0 L0 -24 M0 0 L21 12 M0 0 L-21 12" stroke="var(--wind)" strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <circle cx="0" cy="0" r="2.4" fill="var(--wind)" />
      </g>
      <path d="M420 130 C400 150 380 166 352 178" fill="none" stroke="var(--wind)" strokeWidth="2.2" strokeLinecap="round" className={cls} />

      {/* battery */}
      <g transform="translate(410 250)">
        <rect x="-22" y="-12" width="44" height="24" rx="4" fill="none" stroke="var(--battery)" strokeWidth="1.5" />
        <rect x="22" y="-5" width="4" height="10" rx="1" fill="var(--battery)" />
        <rect x="-18" y="-8" width="22" height="16" rx="2" fill="var(--battery)" opacity="0.55" />
      </g>
      <path d="M352 196 C372 214 388 230 396 238" fill="none" stroke="var(--battery)" strokeWidth="2" strokeLinecap="round" className={`${cls} reverse`} />

      {/* interconnector */}
      <path d="M352 186 C420 186 470 186 540 196" fill="none" stroke="var(--imports)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" className={cls} />
      <text x="470" y="214" fontSize="10" fill="var(--ink-3)" fontFamily="JetBrains Mono, monospace">interconnection</text>

      {/* grid node */}
      <circle cx="340" cy="186" r="38" fill="url(#fh-node)" />
      <circle cx="340" cy="186" r="9" fill="var(--money)" stroke="var(--bg)" strokeWidth="2" />
      {!reduce && <circle cx="340" cy="186" r="9" fill="none" stroke="var(--money)" strokeWidth="1.2" className="pulse-ring" />}
      <text x="322" y="222" fontSize="10" fill="var(--ink-2)" fontFamily="JetBrains Mono, monospace">grid node</text>

      {/* demand */}
      <path d="M340 196 L340 300" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" className={cls} />
      <g transform="translate(340 318)">
        <rect x="-36" y="-12" width="72" height="24" rx="6" fill="var(--panel-2)" stroke="var(--line-strong)" />
        <text x="0" y="4" textAnchor="middle" fontSize="10" fill="var(--ink-2)" fontFamily="JetBrains Mono, monospace">demand</text>
      </g>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </svg>
  );
}
