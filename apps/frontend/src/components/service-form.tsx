import { Spinner } from '@/components/ui/spinner';
import type { FormEvent } from 'react';
import type { HostLink, ServiceInput } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form-error';
import { ServiceFormAdvanced, type FormMonitoring } from '@/components/service-form-advanced';
import { HostPicker } from '@/components/host-picker';
import { DependencyPicker } from '@/components/dependency-picker';
import type { HostConnection, HostInventories } from '@/lib/hosts';
import { t } from '@/i18n';

/** Proxmox data for the "Runs on" section; omitted when the form is used without hosts. */
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

export type { FormMonitoring };

type Props = {
  hosts?: FormHosts;
  monitoring?: FormMonitoring;
  tags?: { value: string[]; onChange: (tags: string[]) => void };
  dependencies?: FormDependencies;
  editing: boolean;
  value: ServiceInput;
  categories: string[];
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
  editing,
  value,
  categories,
  error,
  saving,
  nameRef,
  isPublic,
  onPublicChange,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  return (
    <form
      aria-label={editing ? t('form.editTitle') : t('form.newTitle')}
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
    >
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
        <Field>
          <FieldLabel htmlFor="service-url">{t('form.url')}</FieldLabel>
          <Input
            id="service-url"
            type="url"
            inputMode="url"
            required
            autoComplete="off"
            value={value.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="http://192.168.1.10:8096"
          />
        </Field>
        <Field>
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
        {hosts && <HostPicker {...hosts} />}
        {dependencies && <DependencyPicker {...dependencies} />}
        <Field orientation="horizontal" className="items-start sm:col-span-2">
          <Checkbox
            id="service-private"
            checked={value.allowPrivate === true}
            onCheckedChange={(checked) => set({ allowPrivate: checked === true })}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="service-private">{t('form.allowPrivate')}</FieldLabel>
            <FieldDescription>{t('form.allowPrivateHint')}</FieldDescription>
          </div>
        </Field>
        <Field orientation="horizontal" className="items-start sm:col-span-2">
          <Checkbox
            id="service-public"
            checked={isPublic}
            onCheckedChange={(checked) => onPublicChange(checked === true)}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="service-public">{t('form.public')}</FieldLabel>
            <FieldDescription>{t('form.publicHint')}</FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      <ServiceFormAdvanced value={value} onChange={onChange} monitoring={monitoring} tags={tags} />
      <FormError className="mt-3">{error}</FormError>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Spinner data-icon="inline-start" />}
          {editing ? t('form.saveChanges') : t('form.saveService')}
        </Button>
      </DialogFooter>
    </form>
  );
}
