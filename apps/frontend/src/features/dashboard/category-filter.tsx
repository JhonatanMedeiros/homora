import { Toggle } from '@homora/ui/toggle';
import { t } from '@/i18n';

type Props = {
  categories: string[];
  selected: string | null;
  counts: (category: string | null) => number;
  onSelect: (category: string | null) => void;
};

export function CategoryFilter({ categories, selected, counts, onSelect }: Props) {
  return (
    <div
      role="group"
      aria-label={t('filter.byCategory')}
      // One swipeable row on phones; wraps on wider screens where everything fits.
      className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {[null, ...categories].map((category) => (
        <Toggle
          key={category === null ? '__all__' : `category:${category}`}
          variant="default"
          size="sm"
          pressed={selected === category}
          onPressedChange={() => onSelect(category)}
          onClick={(event) =>
            event.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
          }
          className="shrink-0 whitespace-nowrap text-sm font-medium pointer-coarse:h-11 pointer-coarse:min-w-11 text-muted-foreground transition-colors duration-150 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
        >
          {category ?? t('filter.all')}
          <small aria-hidden="true" className="font-mono text-xs opacity-80">
            {counts(category)}
          </small>
        </Toggle>
      ))}
    </div>
  );
}
