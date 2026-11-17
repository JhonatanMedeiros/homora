import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';

/** Single-choice control for a few short options; unlike a bare ToggleGroup it cannot be emptied. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        const found = options.find((option) => option.value === next);
        if (found) onChange(found.value);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="px-3 pointer-coarse:h-11"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
