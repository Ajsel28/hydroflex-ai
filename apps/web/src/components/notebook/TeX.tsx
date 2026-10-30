import { useMemo } from 'react';
import katex from 'katex';

/** KaTeX renderer (never throws; malformed LaTeX is shown in red by KaTeX itself). */
export function TeX({ latex, display = true, className }: { latex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' });
    } catch {
      return null;
    }
  }, [latex, display]);
  if (html === null) return <code className="font-mono text-xs text-ink-3">{latex}</code>;
  // KaTeX output is generated locally from equation strings served by our own API.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
