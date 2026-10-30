import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, lead, actions, meta }: { eyebrow: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        <div className="eyebrow mb-2 text-hydro">{eyebrow}</div>
        <h1 className="font-serif text-[1.85rem] font-medium leading-tight tracking-tight text-ink sm:text-[2.2rem]">{title}</h1>
        {lead && <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-2">{lead}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? 'max-w-[1480px]' : 'max-w-5xl'} space-y-5 px-4 py-6 sm:px-6 lg:px-8`}>{children}</div>;
}
