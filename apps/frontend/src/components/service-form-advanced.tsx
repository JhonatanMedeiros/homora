import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CERT_WARNING_DAYS,
  CHECK_INTERVAL_DEFAULT,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  CHECK_MATCH_MAX,
  DEFAULT_MONITOR_SETTINGS,
  DEGRADED_LATENCY_MAX,
  DEGRADED_LATENCY_MIN,
  ICON_MAX_LENGTH,
  THRESHOLD_MAX,
  type MonitorSettings,
  type ServiceInput,
} from '@homora/shared';
import { CheckTypePicker } from '@/components/check-type-picker';
import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/icon-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/tag-input';
import { ServiceIcon } from '@/components/service-icon';
import { suggestBrandIcon } from '@/lib/icons';
import { t } from '@/i18n';

/** Alert settings of the service, saved separately from the card; omitted where there is nothing to save to. */
export type FormMonitoring = {
  value: MonitorSettings;
  onChange: (value: MonitorSettings) => void;
};

type Props = {
  value: ServiceInput;
  onChange: (value: ServiceInput) => void;
  monitoring?: FormMonitoring;
  tags?: { value: string[]; onChange: (tags: string[]) => void };
};

/** Optional service details and monitoring configuration. */
export function ServiceFormAdvanced({ value, onChange, monitoring, tags }: Props) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  const checkType = value.checkType ?? 'http';
  const bodyCheck = checkType === 'keyword' || checkType === 'json';
  const usesHttp = checkType === 'http' || bodyCheck;
  const suggestion = suggestBrandIcon(value.name);
  // Starts with the essentials; opens by itself when the service already has advanced values.
  const [advanced, setAdvanced] = useState(() =>
    Boolean(
      value.description ||
      (tags && tags.value.length > 0) ||
      value.icon ||
      (value.checkType && value.checkType !== 'http') ||
      value.checkInterval ||
      value.expectedStatus ||
      value.checkPath ||
      (monitoring &&
        (monitoring.value.failureThreshold !== DEFAULT_MONITOR_SETTINGS.failureThreshold ||
          monitoring.value.recoveryThreshold !== DEFAULT_MONITOR_SETTINGS.recoveryThreshold ||
          monitoring.value.degradedLatencyMs !== DEFAULT_MONITOR_SETTINGS.degradedLatencyMs)),
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
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t('form.descriptionPlaceholder')}
            />
          </Field>
          {tags && (
            <Field>
              <FieldLabel htmlFor="service-tags">
                {t('form.tags')}{' '}
                <small className="font-normal text-muted-foreground">{t('form.tagsHint')}</small>
              </FieldLabel>
              <TagInput id="service-tags" value={tags.value} onChange={tags.onChange} />
            </Field>
          )}
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
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="service-check">{t('form.checkType')}</FieldLabel>
            <CheckTypePicker
              id="service-check"
              value={checkType}
              onChange={(next) =>
                set({
                  checkType: next,
                  // What a type does not use must not linger invisibly in the saved service.
                  ...(next === 'http' || next === 'keyword' || next === 'json'
                    ? {}
                    : { checkPath: null, expectedStatus: null }),
                  ...(next === 'keyword' || next === 'json' ? {} : { checkMatch: null }),
                })
              }
            />
            <FieldDescription>
              {t(`check.hint.${checkType}`, { days: CERT_WARNING_DAYS })}
            </FieldDescription>
          </Field>
          {bodyCheck && (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="service-check-match">
                {t(checkType === 'json' ? 'check.match.json' : 'check.match.keyword')}
              </FieldLabel>
              <Input
                id="service-check-match"
                required
                maxLength={CHECK_MATCH_MAX}
                autoComplete="off"
                value={value.checkMatch ?? ''}
                onChange={(e) => set({ checkMatch: e.target.value || null })}
                placeholder={t(
                  checkType === 'json'
                    ? 'check.match.jsonPlaceholder'
                    : 'check.match.keywordPlaceholder',
                )}
              />
            </Field>
          )}
          {usesHttp && (
            <>
              <Field>
                <FieldLabel htmlFor="service-check-path">{t('form.checkPath')}</FieldLabel>
                <Input
                  id="service-check-path"
                  value={value.checkPath ?? ''}
                  onChange={(e) => set({ checkPath: e.target.value || null })}
                  placeholder="/health"
                  pattern="/[^\s\\#]*"
                  maxLength={2048}
                />
                <FieldDescription>{t('form.checkPathHint')}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="service-expected-status">
                  {t('form.expectedStatus')}
                </FieldLabel>
                <Input
                  id="service-expected-status"
                  value={value.expectedStatus ?? ''}
                  onChange={(e) => set({ expectedStatus: e.target.value || null })}
                  placeholder="200, 2xx"
                  pattern="([1-5][0-9]{2}|2xx|3xx)"
                />
                <FieldDescription>{t('form.expectedStatusHint')}</FieldDescription>
              </Field>
            </>
          )}
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
          {monitoring && (
            <>
              <FieldSeparator className="sm:col-span-2">
                {t('form.monitoring.title')}
              </FieldSeparator>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {t('form.monitoring.hint')}
              </p>
              <Field>
                <FieldLabel htmlFor="service-failures">{t('form.monitoring.failures')}</FieldLabel>
                <Input
                  id="service-failures"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={THRESHOLD_MAX}
                  step={1}
                  value={monitoring.value.failureThreshold}
                  onChange={(e) =>
                    monitoring.onChange({
                      ...monitoring.value,
                      failureThreshold: Number(e.target.value) || 1,
                    })
                  }
                />
                <FieldDescription>{t('form.monitoring.failuresHint')}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="service-recoveries">
                  {t('form.monitoring.recoveries')}
                </FieldLabel>
                <Input
                  id="service-recoveries"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={THRESHOLD_MAX}
                  step={1}
                  value={monitoring.value.recoveryThreshold}
                  onChange={(e) =>
                    monitoring.onChange({
                      ...monitoring.value,
                      recoveryThreshold: Number(e.target.value) || 1,
                    })
                  }
                />
                <FieldDescription>{t('form.monitoring.recoveriesHint')}</FieldDescription>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="service-degraded">{t('form.monitoring.degraded')}</FieldLabel>
                <Input
                  id="service-degraded"
                  type="number"
                  inputMode="numeric"
                  min={DEGRADED_LATENCY_MIN}
                  max={DEGRADED_LATENCY_MAX}
                  step={1}
                  value={monitoring.value.degradedLatencyMs ?? ''}
                  onChange={(e) =>
                    monitoring.onChange({
                      ...monitoring.value,
                      degradedLatencyMs: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="800"
                />
                <FieldDescription>{t('form.monitoring.degradedHint')}</FieldDescription>
              </Field>
            </>
          )}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
