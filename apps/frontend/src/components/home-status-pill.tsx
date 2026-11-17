import { useState, type ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { t } from '@/i18n';
import { pillText, type StatusSummary } from '@/features/uptime/status-summary';
import { cn } from '@homora/ui/lib/utils';

type Props = {
  summary: StatusSummary;
  /** What opens under the pill: the health numbers and the probable causes. */
  children: (close: () => void) => ReactNode;
};

/**
 * Home health in the header: one pill that says "all up" or how many problems there are, and
 * opens the details. The cards below stay the first thing on the page.
 */
export function HomeStatusPill({ summary, children }: Props) {
  const [open, setOpen] = useState(false);
  const text = pillText(summary);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={t('pill.label', { status: text })}
          className="h-9 gap-2 px-2.5 text-xs font-normal text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              summary.tone === 'down' && 'bg-destructive',
              summary.tone === 'warn' && 'bg-warning',
              summary.tone === 'ok' && 'bg-success',
            )}
          />
          <span className="max-sm:sr-only">{text}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="flex max-h-[calc(100svh-6rem)] w-[min(34rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto p-4"
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
