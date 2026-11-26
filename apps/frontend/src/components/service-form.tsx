import { toast } from 'sonner';
import { Spinner } from '@homora/ui/spinner';
import { useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import type { HostLink, ServiceInput } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { DialogFooter } from '@homora/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@homora/ui/field';
import { sameUrl } from '@homora/utils';
import { completeAddress, isServiceAddress } from '@/lib/service-address';
import { Input } from '@homora/ui/input';
import { CopyButton } from '@/components/copy-button';
import { FormError } from '@/components/form-error';
import type { FormMonitoring } from '@/components/service-form-monitoring';
import { ServiceFormLinks, type FormLinks } from '@/components/service-form-links';
import { ServiceFormSections } from '@/components/service-form-sections';
import type { Section } from '@/components/service-form-summary';
import { ServiceIcon } from '@/components/service-icon';
import { suggestBrandIcon } from '@/lib/icons';
import { DependencyPicker } from '@/features/hosts/dependency-picker';
import type { HostConnection, HostInventories } from '@/features/hosts/hosts';
import { t } from '@/i18n';

/** Host inventory data for the "Runs on" section; omitted when the form is used without hosts. */
export type FormHosts = {
  value: HostLink | null;
  onChange: (value: HostLink | null) => void;
  connections: HostConnection[];
  connectionsLoaded: boolean;
  inventories: HostInventories;
  onReload: (connectionId: number, refresh?: boolean) => void;
};

/** Manual dependencies for the form; omitted when the form is used without them. */
export type FormDependencies = React.ComponentProps<typeof DependencyPicker>;

export type { FormMonitoring, FormLinks };

type Props = {
  hosts?: FormHosts;
  monitoring?: FormMonitoring;
  tags?: { value: string[]; onChange: (tags: string[]) => void };
  dependencies?: FormDependencies;
  /** Extra addresses (the "Links" menu of the card); omitted when the form is used without them. */
  links?: FormLinks;
  editing: boolean;
  value: ServiceInput;
  categories: string[];
  /** The other cards, to warn about an address that is already on the dashboard. */
  others?: { name: string; url: string }[];
  /** The section open when the form appears, for shortcuts that lead to one setting. */
  initialSection?: Section;
  error: string;
  saving: boolean;
  nameRef: React.Ref<HTMLInputElement>;
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
  onChange: (value: ServiceInput) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ServiceForm({
  hosts,
  monitoring,
  tags,
  dependencies,
  links,
  editing,
  value,
  categories,
  others = [],
  initialSection = 'look',
  error,
  saving,
  nameRef,
  isPublic,
  onPublicChange,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const [savedAlias] = useState(() => (editing ? value.alias : null));
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  const [open, setOpen] = useState<Section | ''>(initialSection);
  const [badAddress, setBadAddress] = useState(false);
  const duplicate = others.find((other) => sameUrl(other.url, completeAddress(value.url)));
  /** Completes the address first, so the request carries what the field then shows. */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = completeAddress(value.url);
    if (!isServiceAddress(url)) {
      setBadAddress(true);
      document.querySelector<HTMLElement>('#service-url')?.focus();
      return;
    }
    if (url !== value.url) flushSync(() => set({ url }));
    onSubmit(event);
  };
  const suggestion = value.icon ? null : suggestBrandIcon(value.name);
  /** Opens the section holding a field the browser reports as invalid, so the message is seen. */
  const revealInvalid = (event: React.FormEvent) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-section]')?.dataset
      .section as Section | undefined;
    // Flushed so the field is visible when the browser tries to focus it.
    if (id && id !== open) flushSync(() => setOpen(id));
  };
  /** The tile opens the icon field, since choosing an icon lives with the appearance. */
  const changeIcon = () => {
    flushSync(() => setOpen('look'));
    document.querySelector<HTMLElement>('#service-icon')?.focus();
  };
  return (
    <form
      aria-label={editing ? t('form.editTitle') : t('form.newTitle')}
      onSubmit={submit}
      onInvalidCapture={revealInvalid}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={changeIcon}
            aria-label={t('form.changeIcon')}
            className="hidden size-14 shrink-0 place-items-center rounded-xl border bg-secondary text-xl font-semibold transition-colors outline-none hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:grid"
          >
            <ServiceIcon icon={value.icon} name={value.name || '?'} />
          </button>
          <FieldGroup className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="service-name">{t('form.name')}</FieldLabel>
              <Input
                ref={nameRef}
                id="service-name"
                required
                maxLength={80}
                autoComplete="off"
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Jellyfin"
              />
            </Field>
            <Field data-invalid={badAddress || undefined}>
              <FieldLabel htmlFor="service-url">{t('form.url')}</FieldLabel>
              <Input
                id="service-url"
                type="text"
                inputMode="url"
                required
                autoComplete="off"
                value={value.url}
                aria-invalid={badAddress || undefined}
                aria-describedby={badAddress || duplicate ? 'service-url-note' : undefined}
                onChange={(e) => {
                  setBadAddress(false);
                  set({ url: e.target.value });
                }}
                onBlur={() => {
                  const url = completeAddress(value.url);
                  if (url !== value.url) set({ url });
                }}
                placeholder="http://192.168.1.10:8096"
              />
              {badAddress ? (
                <FieldError id="service-url-note">{t('form.urlInvalid')}</FieldError>
              ) : (
                duplicate && (
                  <FieldDescription id="service-url-note" className="text-warning">
                    {t('form.urlDuplicate', { name: duplicate.name })}
                  </FieldDescription>
                )
              )}
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="service-category">{t('form.category')}</FieldLabel>
              <Input
                id="service-category"
                required
                maxLength={40}
                list="categories"
                autoComplete="off"
                value={value.category}
                onChange={(e) => set({ category: e.target.value })}
                placeholder={t('form.categoryPlaceholder')}
              />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="service-alias">{t('form.alias')}</FieldLabel>
              <Input
                id="service-alias"
                value={value.alias ?? ''}
                maxLength={63}
                autoComplete="off"
                onChange={(e) => set({ alias: e.target.value || null })}
              />
              <FieldDescription>{t('form.aliasHint')}</FieldDescription>
              {savedAlias && (
                <div className="flex items-center gap-2">
                  <code>{`${window.location.origin}/go/${savedAlias}`}</code>
                  <CopyButton
                    text={`${window.location.origin}/go/${savedAlias}`}
                    label={t('form.aliasCopy')}
                    onFailed={() => toast.error(t('settings.public.copyFailed'))}
                  />
                </div>
              )}
            </Field>
            {links && <ServiceFormLinks {...links} />}
            {suggestion && (
              <Button
                type="button"
                variant="secondary"
                className="w-fit sm:col-span-2"
                onClick={() => set({ icon: `brand:${suggestion}` })}
              >
                <ServiceIcon icon={`brand:${suggestion}`} name={value.name} />
                {t('icon.suggested', { icon: suggestion })}
              </Button>
            )}
          </FieldGroup>
        </div>
        <ServiceFormSections
          value={value}
          onChange={onChange}
          isPublic={isPublic}
          onPublicChange={onPublicChange}
          monitoring={monitoring}
          tags={tags}
          hosts={hosts}
          dependencies={dependencies}
          open={open}
          onOpenChange={setOpen}
        />
      </div>
      {error && (
        <div className="shrink-0 border-t px-6 pt-3">
          <FormError>{error}</FormError>
        </div>
      )}
      <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving} className="max-sm:flex-1">
          {saving && <Spinner data-icon="inline-start" />}
          {editing ? t('form.saveChanges') : t('form.saveService')}
        </Button>
      </DialogFooter>
    </form>
  );
}
