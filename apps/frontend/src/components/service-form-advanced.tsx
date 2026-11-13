import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CHECK_INTERVAL_DEFAULT,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  ICON_MAX_LENGTH,
  type ServiceInput,
} from '@homora/shared';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/icon-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ServiceIcon } from '@/components/service-icon';
import { suggestBrandIcon } from '@/lib/icons';
import { t } from '@/i18n';

type Props = {
  value: ServiceInput;
  onChange: (value: ServiceInput) => void;
};

/** Optional service details and monitoring configuration. */
export function ServiceFormAdvanced({ value, onChange }: Props) {
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
              onChange={(event) => set({ description: event.target.value })}
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
                onChange={(event) => set({ icon: event.target.value })}
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
            <FormSelect
              id="service-check"
              aria-label={t('form.checkType')}
              value={value.checkType ?? 'http'}
              onChange={(event) =>
                set({ checkType: event.target.value === 'ping' ? 'ping' : 'http' })
              }
            >
              <FormSelectOption value="http">{t('form.checkHttp')}</FormSelectOption>
              <FormSelectOption value="ping">{t('form.checkPing')}</FormSelectOption>
            </FormSelect>
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
              onChange={(event) => set({ checkPath: event.target.value || null })}
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
              onChange={(event) => set({ expectedStatus: event.target.value || null })}
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
              onChange={(event) =>
                set({
                  checkInterval: event.target.value === '' ? null : Number(event.target.value),
                })
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
  );
}
