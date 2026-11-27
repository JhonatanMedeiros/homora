import type { ComponentType, ReactNode } from 'react';
import { cn } from '@homora/ui/lib/utils';

/**
 * The phone's bottom navigation: a capsule that floats above the content, never touching the
 * edges. A soft fade behind it lets the page pass under without a hard cut. It is separated by a
 * 1px line (no shadow), and every item is a 48px target.
 */
export function FloatingNav({
  label,
  homora,
  children,
}: {
  label: string;
  homora?: string;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent"
      />
      <nav
        aria-label={label}
        data-homora={homora}
        className="pointer-events-auto relative mx-3.5 mb-[calc(0.875rem+env(safe-area-inset-bottom))] flex h-15 items-center justify-between rounded-full border bg-card p-1.5"
      >
        {children}
      </nav>
    </div>
  );
}

type ItemProps = {
  icon: ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Haspopup for items that open a sheet. */
  popup?: boolean;
  /** Something is waiting there: a dot, with these words for screen readers. */
  badge?: string;
};

/** One item. Only the active one shows its name; the others keep it for screen readers. */
export function FloatingNavItem({ icon: Icon, label, active, onClick, popup, badge }: ItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-haspopup={popup ? 'dialog' : undefined}
      onClick={onClick}
      className={cn(
        'relative flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[1.375rem]',
        active
          ? 'bg-primary/15 pr-4.5 pl-4 text-accent-text'
          : 'w-13 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      <span className={active ? undefined : 'sr-only'}>{label}</span>
      {badge && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-2 right-2.5 size-2 rounded-full bg-primary"
          />
          <span className="sr-only">, {badge}</span>
        </>
      )}
    </button>
  );
}
