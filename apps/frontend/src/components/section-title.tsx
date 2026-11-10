import type { ReactNode } from 'react';
import { LabelTape } from '@/components/label-tape';

/** Título de seção em fita, com contagem opcional e ações à direita. */
export function SectionTitle({
  id,
  children,
  count,
  actions,
}: {
  id?: string;
  children: ReactNode;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-base font-normal tracking-normal">
        <LabelTape className="h-7 px-2.5 text-base">{children}</LabelTape>
        {count !== undefined && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{count}</span>
        )}
      </h2>
      {actions}
    </div>
  );
}
