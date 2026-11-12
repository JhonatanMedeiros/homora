import { cn } from '@/lib/utils';
import type { Availability } from '@/lib/services';
import { t } from '@/i18n';
import { useEffect, useRef, useState } from 'react';

type Props = { state: Availability; blocked?: boolean; label?: string; className?: string };

const view = {
  available: {
    label: 'status.available',
    text: 'text-success',
    dot: 'bg-success shadow-[0_0_8px_1px_color-mix(in_oklch,var(--success)_70%,transparent)]',
  },
  unavailable: {
    label: 'status.unavailable',
    text: 'text-destructive',
    dot: 'bg-destructive',
  },
  unknown: {
    label: 'status.unknown',
    text: 'text-muted-foreground',
    dot: 'ring-[1.5px] ring-inset ring-muted-foreground',
  },
  blocked: {
    label: 'status.blocked',
    text: 'text-muted-foreground',
    dot: 'ring-[1.5px] ring-inset ring-muted-foreground',
  },
} as const;

/**
 * Homora signature: the window light. Lit green when the service is up, red
 * when down, an empty ring when unknown or blocked. Always paired with text.
 */
export function StatusLight({ state, blocked = false, label: custom, className }: Props) {
  const key = blocked ? 'blocked' : state;
  const { label, text, dot } = view[key];
  const previousState = useRef(key);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (previousState.current === key) return;
    previousState.current = key;
    setChanged(true);
    const timeout = window.setTimeout(() => setChanged(false), 520);
    return () => window.clearTimeout(timeout);
  }, [key]);

  return (
    <span
      data-slot="status-light"
      data-state={key}
      data-status-changed={changed || undefined}
      className={cn(
        'inline-flex w-fit items-center gap-2 text-sm leading-none font-medium whitespace-nowrap',
        text,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('status-light-dot size-2 shrink-0 rounded-full', dot)}
      />
      <span>{custom ?? t(label)}</span>
    </span>
  );
}
