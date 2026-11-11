import type { ReactNode } from 'react';
import { LabelTape } from '@/components/label-tape';
import { Separator } from '@/components/ui/separator';

/** Subtle title by default; tape is an explicit choice. */
export function SectionTitle({
  id,
  children,
  count,
  actions,
  variant = 'default',
}: {
  id?: string;
  children: ReactNode;
  count?: number;
  actions?: ReactNode;
  variant?: 'default' | 'tape';
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-lg font-semibold">
        {variant === 'default' ? (
          <span className="break-words">{children}</span>
        ) : (
          <LabelTape className="h-7 px-2.5 text-base">{children}</LabelTape>
        )}
        {count !== undefined && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{count}</span>
        )}
      </h2>
      {variant === 'default' && <Separator className="min-w-8 flex-1" />}
      {actions}
    </div>
  );
}
