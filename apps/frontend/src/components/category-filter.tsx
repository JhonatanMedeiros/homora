import { Toggle } from '@/components/ui/toggle';

type Props = {
  categories: string[];
  selected: string | null;
  counts: (category: string | null) => number;
  onSelect: (category: string | null) => void;
};

export function CategoryFilter({ categories, selected, counts, onSelect }: Props) {
  return (
    <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
      {[null, ...categories].map((category) => (
        <Toggle
          key={category === null ? '__all__' : `category:${category}`}
          variant="outline"
          size="sm"
          pressed={selected === category}
          onPressedChange={() => onSelect(category)}
          className="font-label text-sm font-semibold tracking-wide data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {category ?? 'Todos'}
          <small aria-hidden="true" className="font-mono text-xs opacity-80">
            {counts(category)}
          </small>
        </Toggle>
      ))}
    </div>
  );
}
