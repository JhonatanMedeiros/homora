import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { t } from '@/i18n';

export type Suggestion = {
  /** Container id sent back on import. Missing when the container could not be matched. */
  id: string | undefined;
  name: string;
  group: string;
  url: string;
  container: string | undefined;
  isNew: boolean;
};

/** Containers offered as cards. Only new ones can be picked; duplicates stay visible but locked. */
export function SuggestionList({
  idPrefix,
  label,
  items,
  selected,
  onChange,
  disabled,
}: {
  idPrefix: string;
  label: string;
  items: Suggestion[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const pickable = items.flatMap((item) => (item.isNew && item.id ? [item.id] : []));
  const all = pickable.length > 0 && pickable.every((id) => selected.has(id));
  const some = pickable.some((id) => selected.has(id));
  return (
    <div className="flex flex-col gap-2">
      {pickable.length > 1 && (
        <div className="flex items-center gap-3 px-3 text-sm">
          <Checkbox
            id={`${idPrefix}-all`}
            disabled={disabled}
            checked={all ? true : some ? 'indeterminate' : false}
            onCheckedChange={(checked) => onChange(new Set(checked === true ? pickable : []))}
          />
          <Label htmlFor={`${idPrefix}-all`} className="font-medium">
            {t('discovery.selectAll')}
          </Label>
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
            {t('discovery.selected', { count: selected.size })}
          </span>
        </div>
      )}
      <ul
        aria-label={label}
        className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-lg border bg-card text-sm"
      >
        {items.map((item) => {
          const id = `${idPrefix}-${item.id ?? item.url}`;
          const locked = !item.isNew || !item.id;
          return (
            <li key={id} className="flex items-start gap-3 p-3">
              <Checkbox
                id={id}
                disabled={locked || disabled}
                checked={!locked && selected.has(item.id!)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked === true) next.add(item.id!);
                  else next.delete(item.id!);
                  onChange(next);
                }}
              />
              <Label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words">
                  <b className="font-semibold">{item.name}</b>{' '}
                  <span className="text-muted-foreground">· {item.group}</span>
                </span>
                <span className="font-mono text-xs break-all text-muted-foreground">
                  {item.url}
                </span>
                {item.container && (
                  <small className="text-muted-foreground">
                    {t('discovery.container', { name: item.container })}
                  </small>
                )}
              </Label>
              <Badge variant={item.isNew ? 'success' : 'secondary'}>
                {item.isNew ? t('transfer.statusNew') : t('transfer.statusDuplicate')}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Explicit opt-in: new cards never monitor private addresses unless this is checked. */
export function PrivateOption({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" className="items-start">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={id}>{t('discovery.private')}</FieldLabel>
        <FieldDescription>{t('discovery.privateHint')}</FieldDescription>
      </div>
    </Field>
  );
}
