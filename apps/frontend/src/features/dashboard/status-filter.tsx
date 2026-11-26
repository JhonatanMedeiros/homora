import { t } from '@/i18n';
import {
  STATUS_FILTERS,
  type StatusFilter as Filter,
} from '@/features/dashboard/status-filter-model';
import { cn } from '@homora/ui/lib/utils';

type Props = {
  selected: Filter;
  counts: Record<Filter, number>;
  onSelect: (filter: Filter) => void;
};

/** A dot of the state's colour, so the segments read as states and not as group names. */
const DOT: Record<Filter, string | null> = {
  all: null,
  down: 'bg-destructive',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  ok: 'bg-success',
  unmeasured: 'bg-muted-foreground',
};

/**
 * Todos / Offline / Degradados / Em manutenção as one segmented control with the count of each.
 * It is deliberately unlike the category and tag chips below it: a single bordered track, state
 * dots, and a raised selected segment. A state with nothing in it has a faded dot, not hidden.
 */
export function StatusFilter({ selected, counts, onSelect }: Props) {
  return (
    <div
      role="group"
      aria-label={t('filter.byStatus')}
      className="flex w-full max-w-full gap-0.5 overflow-x-auto rounded-lg border bg-muted/50 p-0.5 sm:inline-flex sm:w-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {STATUS_FILTERS.map((filter) => {
        const on = selected === filter;
        const empty = counts[filter] === 0 && filter !== 'all';
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(filter)}
            className={cn(
              'inline-flex flex-1 shrink-0 items-center justify-center gap-1 rounded-md px-1 py-1 text-xs font-medium sm:flex-none sm:gap-1.5 sm:px-2.5 sm:text-sm whitespace-nowrap transition-colors outline-none pointer-coarse:min-h-10 focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {DOT[filter] && (
              <span
                aria-hidden="true"
                className={cn('size-2 rounded-full', DOT[filter], empty && !on && 'opacity-40')}
              />
            )}
            {t(`filter.status.${filter}`)}
            <small
              aria-hidden="true"
              className="font-mono text-xs text-muted-foreground tabular-nums"
            >
              {counts[filter]}
            </small>
          </button>
        );
      })}
    </div>
  );
}
