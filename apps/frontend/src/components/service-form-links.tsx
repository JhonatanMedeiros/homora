import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { LINK_NAME_MAX, LINK_URL_MAX, SERVICE_LINKS_MAX, type OpenTarget } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { FieldDescription } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { LinkTypePicker } from '@/components/link-type-picker';
import type { LinkTypesApi } from '@/hooks/use-link-types';
import { emptyLinkDraft, type LinkDraft } from '@/lib/service-links';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

/** Extra addresses of the service being edited, as the form holds them. */
export type FormLinks = {
  value: LinkDraft[];
  onChange: (value: LinkDraft[]) => void;
  types: LinkTypesApi;
};

const OPEN_VALUES: readonly OpenTarget[] = ['new-tab', 'same-tab'];

/**
 * "Other addresses" under the main URL: the same service reached another way, such as the LAN IP
 * when the domain is down. Closed and empty for a new service; open when there are addresses.
 * Changes are saved with the form. The main URL above stays the one the card opens.
 */
export function ServiceFormLinks({ value, onChange, types }: FormLinks) {
  const [open, setOpen] = useState(value.length > 0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const urlInputs = useRef(new Map<string, HTMLInputElement>());
  const count = value.length;
  const full = count >= SERVICE_LINKS_MAX;

  useEffect(() => {
    if (!focusKey) return;
    urlInputs.current.get(focusKey)?.focus();
    // Focus the new row once it exists, then forget it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusKey(null);
  }, [focusKey, value]);

  const patch = (key: string, next: Partial<LinkDraft>) =>
    onChange(value.map((item) => (item.key === key ? { ...item, ...next } : item)));
  const move = (from: number, by: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(from + by, 0, item);
    onChange(next);
  };
  const add = () => {
    if (full) return;
    const draft = emptyLinkDraft();
    onChange([...value, draft]);
    setFocusKey(draft.key);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="sm:col-span-2"
      // A native validation error inside a closed block would be invisible: open it first.
      onInvalidCapture={() => {
        if (!open) flushSync(() => setOpen(true));
      }}
    >
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between">
          <span>{count > 0 ? t('links.sectionCount', { count }) : t('links.section')}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="data-[state=closed]:hidden">
        <div className="flex flex-col gap-3 pt-3">
          <FieldDescription>{t('links.hint')}</FieldDescription>
          {count === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t('links.none')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {value.map((link, index) => (
                <li key={link.key} className="flex flex-col gap-2 rounded-lg border bg-card/50 p-3">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[10rem_1fr_auto]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <LinkTypePicker
                        index={index}
                        value={link.typeId}
                        api={types}
                        onChange={(typeId) => patch(link.key, { typeId })}
                      />
                    </div>
                    <Input
                      aria-label={t('links.name', { n: index + 1 })}
                      maxLength={LINK_NAME_MAX}
                      autoComplete="off"
                      value={link.name}
                      placeholder={t('links.namePlaceholder', {
                        default:
                          types.types.find((type) => type.id === link.typeId)?.name ?? 'host',
                      })}
                      onChange={(event) => patch(link.key, { name: event.target.value })}
                    />
                    <span className="flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        aria-label={t('links.moveUp', { n: index + 1 })}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === count - 1}
                        aria-label={t('links.moveDown', { n: index + 1 })}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('links.remove', { n: index + 1 })}
                        onClick={() => onChange(value.filter((item) => item.key !== link.key))}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                  <Input
                    ref={(element) => {
                      if (element) urlInputs.current.set(link.key, element);
                      else urlInputs.current.delete(link.key);
                    }}
                    type="url"
                    inputMode="url"
                    required
                    maxLength={LINK_URL_MAX}
                    autoComplete="off"
                    aria-label={t('links.url', { n: index + 1 })}
                    value={link.url}
                    placeholder="http://192.168.1.10:8096"
                    onChange={(event) => patch(link.key, { url: event.target.value })}
                  />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t('links.openIn')}</span>
                    <FormSelect
                      aria-label={t('links.openIn')}
                      className="h-8 w-auto min-w-40"
                      value={link.openTarget ?? ''}
                      onChange={(event) =>
                        patch(link.key, {
                          openTarget:
                            OPEN_VALUES.find((target) => target === event.target.value) ?? null,
                        })
                      }
                    >
                      <FormSelectOption value="">{t('links.openDefault')}</FormSelectOption>
                      <FormSelectOption value="new-tab">{t('links.openNew')}</FormSelectOption>
                      <FormSelectOption value="same-tab">{t('links.openSame')}</FormSelectOption>
                    </FormSelect>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={full} onClick={add}>
              <Plus />
              {t('links.add')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {full
                ? t('links.limit', { max: SERVICE_LINKS_MAX })
                : t('links.count', { count, max: SERVICE_LINKS_MAX })}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
