import { Spinner } from '@/components/ui/spinner';
import { useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CHECK_INTERVAL_DEFAULT,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  ICON_MAX_LENGTH,
  type ServiceInput,
} from '@homora/shared';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { IconPicker } from '@/components/icon-picker';
import { suggestBrandIcon } from '@/lib/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  isPublic: boolean;
  onPublicChange: (value: boolean) => void;
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
  isPublic,
  onPublicChange,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  const suggestion = suggestBrandIcon(value.name);
  // Starts with the essentials; opens by itself when the service already has advanced values.
  const [advanced, setAdvanced] = useState(() =>
    Boolean(
      value.description ||
      value.icon ||
      value.checkType === 'ping' ||
      value.checkInterval ||
      value.expectedStatus ||
      value.checkPath,
    ),
  );
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
      <Collapsible open={advanced} onOpenChange={setAdvanced} className="flex flex-col gap-4">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="w-fit">
            <ChevronDown className={advanced ? '' : '-rotate-90'} aria-hidden="true" />
            {t('form.advanced')}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
                  className="min-w-0 flex-1"
                  value={value.icon ?? ''}
                  onChange={(e) => set({ icon: e.target.value })}
                  placeholder={t('form.iconPlaceholder')}
                />
                <IconPicker iconOnly value={value.icon ?? ''} onChange={(icon) => set({ icon })} />
              </div>
              {!value.icon && suggestion && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => set({ icon: `brand:${suggestion}` })}
                  >
                    <ServiceIcon icon={`brand:${suggestion}`} name={value.name} />
                    {t('icon.suggested', { icon: suggestion })}
                  </Button>
                </div>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="service-check">{t('form.checkType')}</FieldLabel>
              <NativeSelect
                id="service-check"
                value={value.checkType ?? 'http'}
                onChange={(e) => set({ checkType: e.target.value === 'ping' ? 'ping' : 'http' })}
              >
                <option value="http">{t('form.checkHttp')}</option>
                <option value="ping">{t('form.checkPing')}</option>
              </NativeSelect>
              <FieldDescription>
                {value.checkType === 'ping' ? t('form.checkPingHint') : t('form.checkHttpHint')}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-check-path">{t('form.checkPath')}</FieldLabel>
              <Input
                id="service-check-path"
                disabled={value.checkType === 'ping'}
                value={value.checkPath ?? ''}
                onChange={(e) => set({ checkPath: e.target.value || null })}
                placeholder="/health"
                pattern="/[^\s\\#]*"
                maxLength={2048}
              />
              <FieldDescription>{t('form.checkPathHint')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-expected-status">{t('form.expectedStatus')}</FieldLabel>
              <Input
                id="service-expected-status"
                disabled={value.checkType === 'ping'}
                value={value.expectedStatus ?? ''}
                onChange={(e) => set({ expectedStatus: e.target.value || null })}
                placeholder="200, 2xx"
                pattern="([1-5][0-9]{2}|2xx|3xx)"
              />
              <FieldDescription>{t('form.expectedStatusHint')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="service-interval">{t('form.interval')}</FieldLabel>
              <Input
                id="service-interval"
                type="number"
                inputMode="numeric"
                min={CHECK_INTERVAL_MIN}
                max={CHECK_INTERVAL_MAX}
                step={1}
                value={value.checkInterval ?? ''}
                onChange={(e) =>
                  set({ checkInterval: e.target.value === '' ? null : Number(e.target.value) })
                }
                placeholder={String(CHECK_INTERVAL_DEFAULT)}
              />
              <FieldDescription>
                {t('form.intervalHint', { min: CHECK_INTERVAL_MIN, max: CHECK_INTERVAL_MAX })}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
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
