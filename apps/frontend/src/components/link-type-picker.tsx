import { useState } from 'react';
import { Check, ChevronsUpDown, Pencil, Plus } from 'lucide-react';
import {
  LINK_COLORS,
  LINK_TYPE_NAME_MAX,
  LINK_TYPES_MAX,
  sameLinkTypeName,
  SUGGESTED_LINK_TYPES,
  type LinkColor,
} from '@homora/shared';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { LinkTypesApi } from '@/hooks/use-link-types';
import { LINK_COLOR_CLASS, LINK_COLOR_DOT } from '@/lib/service-links';
import { cn } from '@/lib/utils';
import { t, type MessageKey } from '@/i18n';

const SUGGESTION_KEY: Record<string, MessageKey> = {
  public: 'linkType.suggest.public',
  lan: 'linkType.suggest.lan',
  admin: 'linkType.suggest.admin',
  docs: 'linkType.suggest.docs',
};
const COLOR_KEY: Record<LinkColor, MessageKey> = {
  neutral: 'linkColor.neutral',
  ember: 'linkColor.ember',
  green: 'linkColor.green',
  blue: 'linkColor.blue',
  violet: 'linkColor.violet',
  pink: 'linkColor.pink',
  teal: 'linkColor.teal',
  yellow: 'linkColor.yellow',
};

export function TypeChip({
  name,
  color,
  className,
}: {
  name: string;
  color: LinkColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 text-[0.625rem] leading-none font-semibold tracking-wider uppercase',
        LINK_COLOR_CLASS[color],
        className,
      )}
    >
      {name}
    </span>
  );
}

type Editing = { id: number; name: string; color: LinkColor; confirming: boolean; fresh: boolean };

type Props = {
  /** The row's number, for the accessible name. */
  index: number;
  value: number | null;
  api: LinkTypesApi;
  onChange: (typeId: number | null) => void;
};

/**
 * Combobox for the type of an extra address: choose a type, or type a new name and create it on
 * the spot, then pick its color. The pencil next to each type renames, recolors or deletes it.
 * Types are shared by every card, so a change shows everywhere.
 */
export function LinkTypePicker({ index, value, api, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = api.types.find((type) => type.id === value) ?? null;
  const atLimit = api.types.length >= LINK_TYPES_MAX;

  const reset = () => {
    setQuery('');
    setEditing(null);
    setError('');
  };
  const nextColor = () =>
    LINK_COLORS.find((color) => !api.types.some((type) => type.color === color)) ??
    LINK_COLORS[api.types.length % LINK_COLORS.length];

  /** Creates the type (a typed name or a suggestion) and selects it; typed names open the color step. */
  const create = async (rawName: string, color: LinkColor, pickColor: boolean) => {
    setBusy(true);
    setError('');
    const result = await api.create(rawName, color);
    setBusy(false);
    if ('error' in result) return setError(result.error);
    onChange(result.type.id);
    if (pickColor)
      setEditing({
        id: result.type.id,
        name: result.type.name,
        color: result.type.color,
        confirming: false,
        fresh: true,
      });
    else {
      setOpen(false);
      reset();
    }
  };
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError('');
    const result = await api.update(editing.id, { name: editing.name, color: editing.color });
    setBusy(false);
    if ('error' in result) return setError(result.error);
    setOpen(false);
    reset();
  };
  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    const result = await api.remove(editing.id);
    setBusy(false);
    if ('error' in result) return setError(result.error);
    if (value === editing.id) onChange(null);
    reset();
  };

  const text = query.trim();
  const suggestions = SUGGESTED_LINK_TYPES.map((item) => ({
    ...item,
    name: t(SUGGESTION_KEY[item.key]),
  })).filter((item) => !api.types.some((type) => sameLinkTypeName(type.name, item.name)));
  const exists =
    api.types.some((type) => sameLinkTypeName(type.name, text)) ||
    suggestions.some((item) => sameLinkTypeName(item.name, text));
  const editingType = editing ? api.types.find((type) => type.id === editing.id) : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={t('linkType.label', { n: index + 1 })}
          className="w-full justify-between gap-2 px-2.5 font-normal"
        >
          {current ? (
            <TypeChip name={current.name} color={current.color} />
          ) : (
            <span className="text-muted-foreground">{t('linkType.none')}</span>
          )}
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[90vw] p-0">
        {editing ? (
          <div className="flex flex-col gap-3 p-3">
            <h4 className="text-sm font-semibold">
              {editing.fresh ? t('linkType.newTitle') : t('linkType.editTitle')}
            </h4>
            <Field>
              <FieldLabel htmlFor="link-type-name">{t('linkType.name')}</FieldLabel>
              <Input
                id="link-type-name"
                autoFocus
                maxLength={LINK_TYPE_NAME_MAX}
                value={editing.name}
                aria-invalid={error ? true : undefined}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void save();
                }}
              />
            </Field>
            <Field>
              <FieldLabel id="link-type-color">{t('linkType.color')}</FieldLabel>
              <ToggleGroup
                type="single"
                aria-labelledby="link-type-color"
                value={editing.color}
                onValueChange={(next) => {
                  const color = LINK_COLORS.find((item) => item === next);
                  if (color) setEditing({ ...editing, color });
                }}
                className="flex-wrap justify-start gap-1.5"
              >
                {LINK_COLORS.map((color) => (
                  <ToggleGroupItem
                    key={color}
                    value={color}
                    aria-label={t(COLOR_KEY[color])}
                    title={t(COLOR_KEY[color])}
                    className="size-8 rounded-full border-2 border-transparent p-0 data-[state=on]:border-foreground data-[state=on]:bg-transparent"
                  >
                    <span className={cn('size-5 rounded-full', LINK_COLOR_DOT[color])} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {t('linkType.preview')}
              <TypeChip name={editing.name.trim() || '…'} color={editing.color} />
            </p>
            {editing.confirming && (
              <p className="rounded-md bg-warning/15 p-2 text-xs text-warning">
                {editingType && editingType.uses > 0
                  ? t('linkType.usedBy', { count: editingType.uses })
                  : t('linkType.unused')}
              </p>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {editing.confirming ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    {t('linkType.deleteConfirm')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing({ ...editing, confirming: false })}
                  >
                    {t('linkType.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setEditing({ ...editing, confirming: true })}
                  >
                    {t('linkType.delete')}
                  </Button>
                  <span className="flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={reset}>
                      {t('linkType.back')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !editing.name.trim()}
                      onClick={() => void save()}
                    >
                      {t('linkType.done')}
                    </Button>
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput
              placeholder={t('linkType.search')}
              value={query}
              onValueChange={(next) => {
                setQuery(next);
                setError('');
              }}
              maxLength={LINK_TYPE_NAME_MAX}
            />
            <CommandList>
              <CommandGroup>
                <CommandItem
                  value={t('linkType.none')}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                    reset();
                  }}
                >
                  <span className="flex-1 text-muted-foreground">{t('linkType.none')}</span>
                  {value === null && <Check aria-hidden="true" />}
                </CommandItem>
              </CommandGroup>
              {api.types.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading={t('linkType.types')}>
                    {api.types.map((type) => (
                      <CommandItem
                        key={type.id}
                        value={type.name}
                        onSelect={() => {
                          onChange(type.id);
                          setOpen(false);
                          reset();
                        }}
                      >
                        <TypeChip name={type.name} color={type.color} />
                        {value === type.id && <Check aria-hidden="true" className="ml-1" />}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto size-7 pointer-coarse:size-9"
                          aria-label={t('linkType.edit', { name: type.name })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setError('');
                            setEditing({
                              id: type.id,
                              name: type.name,
                              color: type.color,
                              confirming: false,
                              fresh: false,
                            });
                          }}
                        >
                          <Pencil />
                        </Button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {suggestions.length > 0 && !atLimit && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading={t('linkType.suggestions')}>
                    {suggestions.map((item) => (
                      <CommandItem
                        key={item.key}
                        value={item.name}
                        disabled={busy}
                        onSelect={() => void create(item.name, item.color, false)}
                      >
                        <Plus aria-hidden="true" className="text-muted-foreground" />
                        <TypeChip name={item.name} color={item.color} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {text && !exists && (
                <>
                  <CommandSeparator />
                  <CommandGroup forceMount>
                    {atLimit ? (
                      <p className="px-2 py-1.5 text-sm text-muted-foreground">
                        {t('linkType.limit', { max: LINK_TYPES_MAX })}
                      </p>
                    ) : (
                      <CommandItem
                        forceMount
                        value={`create ${text}`}
                        disabled={busy}
                        onSelect={() => void create(text, nextColor(), true)}
                        className="text-accent-text"
                      >
                        <Plus aria-hidden="true" />
                        {t('linkType.create', { name: text })}
                      </CommandItem>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {error && (
              <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
