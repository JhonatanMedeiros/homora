import { type FormEvent } from 'react';
import { ICON_MAX_LENGTH, type ServiceInput } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { IconPicker } from '@/components/icon-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form-error';
import { ServiceIcon } from '@/components/service-icon';
import { t } from '@/i18n';

type Props = {
  editing: boolean;
  value: ServiceInput;
  categories: string[];
  error: string;
  saving: boolean;
  nameRef: React.Ref<HTMLInputElement>;
  onChange: (value: ServiceInput) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ServiceForm({
  editing,
  value,
  categories,
  error,
  saving,
  nameRef,
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
        <Field>
          <FieldLabel htmlFor="service-description">
            {t('form.description')}{' '}
            <small className="font-normal text-muted-foreground">{t('common.optional')}</small>
          </FieldLabel>
          <Input
            id="service-description"
            maxLength={140}
            autoComplete="off"
            value={value.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder={t('form.descriptionPlaceholder')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-icon">
            {t('form.icon')}{' '}
            <small className="font-normal text-muted-foreground">{t('form.iconHint')}</small>
          </FieldLabel>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-lg font-semibold"
            >
              <ServiceIcon icon={value.icon} name={value.name || '?'} />
            </span>
            <Input
              id="service-icon"
              maxLength={ICON_MAX_LENGTH}
              autoComplete="off"
              value={value.icon ?? ''}
              onChange={(e) => set({ icon: e.target.value })}
              placeholder={t('form.iconPlaceholder')}
            />
          </div>
          <IconPicker value={value.icon ?? ''} onChange={(icon) => set({ icon })} />
        </Field>
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
      </FieldGroup>
      <FormError className="mt-3">{error}</FormError>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {editing ? t('form.saveChanges') : t('form.saveService')}
        </Button>
      </DialogFooter>
    </form>
  );
}
