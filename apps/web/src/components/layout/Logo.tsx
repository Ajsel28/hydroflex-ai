/** Original brand mark: a reservoir wave crossed by a grid node (three-phase tie). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="hf-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--hydro)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="var(--line-strong)" />
      {/* dam wall */}
      <path d="M9 30 L13 14 L15 14 L13.5 30 Z" fill="var(--ink-3)" opacity="0.55" />
      {/* reservoir */}
      <path d="M14 22c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 1.4 2V30H13.5Z" fill="url(#hf-water)" opacity="0.35" />
      <path d="M14 22c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 1.4 2" fill="none" stroke="var(--hydro)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 26.5c2.4 0 2.4-1.5 4.8-1.5s2.4 1.5 4.8 1.5 2.4-1.5 4.8-1.5 2.4 1.5 2 1.5" fill="none" stroke="var(--hydro)" strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" />
      {/* grid node */}
      <path d="M26 6.5v7.5M21 10.5l5 3.5 5-3.5" fill="none" stroke="var(--renew)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="6.5" r="2.1" fill="var(--renew)" />
      <circle cx="21" cy="10.5" r="1.3" fill="var(--renew)" opacity="0.8" />
      <circle cx="31" cy="10.5" r="1.3" fill="var(--renew)" opacity="0.8" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 28 : 32} />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[0.95rem] font-extrabold tracking-[0.08em] text-ink">
            HYDROFLEX<span className="ml-1 font-mono text-[0.7rem] font-medium tracking-normal text-hydro">AI</span>
          </span>
          <span className="mt-1 text-[0.62rem] tracking-wide text-ink-3">Climate Intelligence for Resilient Energy</span>
        </span>
      )}
    </span>
  );
}
