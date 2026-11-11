import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

/** Section title with a count and a hairline divider. */
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
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-lg font-semibold">
        <span className="break-words">{children}</span>
        {count !== undefined && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{count}</span>
        )}
      </h2>
      <Separator className="min-w-8 flex-1" />
      {actions}
    </div>
  );
}
