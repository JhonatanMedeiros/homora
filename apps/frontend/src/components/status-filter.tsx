import { Toggle } from '@/components/ui/toggle';
import { t } from '@/i18n';
import { STATUS_FILTERS, type StatusFilter as Filter } from '@/lib/status-filter';

type Props = {
  selected: Filter;
  counts: Record<Filter, number>;
  onSelect: (filter: Filter) => void;
};

/** Todos / Offline / Degradados / Em manutenção, each with its count. */
export function StatusFilter({ selected, counts, onSelect }: Props) {
  return (
    <div
      role="group"
      aria-label={t('filter.byStatus')}
      className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {STATUS_FILTERS.map((filter) => (
        <Toggle
          key={filter}
          size="sm"
          pressed={selected === filter}
          onPressedChange={() => onSelect(filter)}
          className="shrink-0 whitespace-nowrap text-sm font-medium pointer-coarse:h-11 pointer-coarse:min-w-11 text-muted-foreground transition-colors duration-150 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          {t(`filter.status.${filter}`)}
          <small aria-hidden="true" className="font-mono text-xs opacity-80">
            {counts[filter]}
          </small>
        </Toggle>
      ))}
    </div>
  );
}
