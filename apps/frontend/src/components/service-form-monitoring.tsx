import {
  CERT_WARNING_DAYS,
  CHECK_INTERVAL_DEFAULT,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  CHECK_MATCH_MAX,
  DEGRADED_LATENCY_MAX,
  DEGRADED_LATENCY_MIN,
  THRESHOLD_MAX,
  type MonitorSettings,
  type ServiceInput,
} from '@homora/shared';
import { CheckTypePicker } from '@/components/check-type-picker';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
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
};

/** How the service is checked and when it raises an alert. */
export function MonitoringPanel({ value, onChange, monitoring }: Props) {
  const set = (patch: Partial<ServiceInput>) => onChange({ ...value, ...patch });
  const checkType = value.checkType ?? 'http';
  const bodyCheck = checkType === 'keyword' || checkType === 'json';
  const usesHttp = checkType === 'http' || bodyCheck;
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
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
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="service-check-url">{t('form.checkUrl')}</FieldLabel>
        <Input
          id="service-check-url"
          type="url"
          pattern="https?://[^/?#@\s]+(/[^?#\s]*)?"
          maxLength={2048}
          value={value.checkUrl ?? ''}
          onChange={(e) => set({ checkUrl: e.target.value || null })}
          placeholder="https://192.168.1.10/health"
        />
        <FieldDescription>{t('form.checkUrlHint')}</FieldDescription>
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
            <FieldLabel htmlFor="service-expected-status">{t('form.expectedStatus')}</FieldLabel>
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
          <FieldSeparator className="sm:col-span-2">{t('form.monitoring.title')}</FieldSeparator>
          <p className="text-sm text-muted-foreground sm:col-span-2">{t('form.monitoring.hint')}</p>
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
            <FieldLabel htmlFor="service-recoveries">{t('form.monitoring.recoveries')}</FieldLabel>
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
  );
}
