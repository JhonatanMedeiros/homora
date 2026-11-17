import { useEffect, useState } from 'react';
import { Button } from '@homora/ui/button';
import { Badge } from '@homora/ui/badge';
import { Checkbox } from '@homora/ui/checkbox';
import { Field, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Skeleton } from '@homora/ui/skeleton';
import type { MonitoringCertificates } from '../../../monitoring.js';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultCertificateConfig,
  expiryState,
  widgetCertificateExpiryWidget,
  type CertificateConfig,
} from '../definition.js';

export function CertificateView({ config }: { config: CertificateConfig }) {
  const { t, locale, monitoring, openMonitor } = useWidgetHost();
  const read = monitoring?.readCertificates;
  const key = JSON.stringify({ pages: config.pages, groups: config.groups });
  const [reading, setReading] = useState<{
    key: string;
    data: MonitoringCertificates | null;
    failed: boolean;
    now: number;
  }>({ key, data: null, failed: false, now: Date.now() });
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!read) throw new Error('source unavailable');
        const data = await read(JSON.parse(key), request.signal);
        if (active && !request.signal.aborted)
          setReading({ key, data, failed: false, now: Date.now() });
      } catch {
        if (active && !request.signal.aborted)
          setReading((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            failed: true,
            now: Date.now(),
          }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, read]);
  if (reading.key !== key || (!reading.data && !reading.failed))
    return (
      <div role="status" aria-busy="true" aria-label={t('certificate.loading')}>
        <Skeleton aria-hidden="true" className="h-12 w-full motion-reduce:animate-none" />
      </div>
    );
  if (!reading.data) return <p role="alert">{t('certificate.error')}</p>;
  const { data, now } = reading;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {(reading.failed || now - data.generatedAt > 120_000) && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('certificate.stale')}
        </p>
      )}
      {data.missingFilter ? (
        <p role="status">{t('certificate.missing')}</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('certificate.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.items.map((item) => {
            const state = expiryState(item.expiresAt, config.threshold, now);
            const time =
              item.expiresAt === null
                ? ''
                : Math.abs(item.expiresAt - now) >= 86_400_000
                  ? relative.format(Math.trunc((item.expiresAt - now) / 86_400_000), 'day')
                  : relative.format(Math.trunc((item.expiresAt - now) / 3_600_000), 'hour');
            return (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!openMonitor}
                  onClick={() => openMonitor?.(item.id, true)}
                  className="h-auto min-h-11 w-full justify-start whitespace-normal px-1 py-2 text-left"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="break-words font-medium">{item.name}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          state === 'expired'
                            ? 'destructive'
                            : state === 'warning'
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {t(`certificate.${state}`)}
                      </Badge>
                      <span className="text-xs font-normal text-muted-foreground">
                        {t(`certificate.state.${item.state}`)}
                        {item.expiresAt !== null && ` · ${date.format(item.expiresAt)} · ${time}`}
                      </span>
                    </span>
                    {item.stale && item.observedAt !== null && (
                      <span className="text-xs text-muted-foreground">
                        {t('certificate.prior', { time: date.format(item.observedAt) })}
                      </span>
                    )}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {data.total > data.items.length && (
        <p className="text-xs text-muted-foreground">
          {t('certificate.showing', { shown: data.items.length, total: data.total })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t('certificate.validity')}</p>
    </div>
  );
}
function Editor({
  config,
  onChange,
}: {
  config: CertificateConfig;
  onChange: (value: CertificateConfig) => void;
}) {
  const { t, pages = [], groups = [] } = useWidgetHost();
  const scope = (key: 'pages' | 'groups', options: string[]) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t(`certificate.${key}`)}</legend>
      <p className="text-xs text-muted-foreground">{t('certificate.all')}</p>
      {[...new Set([...options, ...config[key]])].map((name) => (
        <label key={name} className="flex min-h-9 items-center gap-2 text-sm">
          <Checkbox
            checked={config[key].includes(name)}
            onCheckedChange={(checked) =>
              onChange({
                ...config,
                [key]:
                  checked === true ? [...config[key], name] : config[key].filter((n) => n !== name),
              })
            }
          />
          {name}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="cert-threshold">{t('certificate.threshold')}</FieldLabel>
        <FormSelect
          id="cert-threshold"
          value={String(config.threshold)}
          onChange={(e) =>
            onChange({
              ...config,
              threshold: Number(e.target.value) as CertificateConfig['threshold'],
            })
          }
        >
          {[7, 14, 30, 60].map((n) => (
            <FormSelectOption key={n} value={String(n)}>
              {t('certificate.days', { count: n })}
            </FormSelectOption>
          ))}
        </FormSelect>
      </Field>
      {scope(
        'pages',
        pages.map((p) => p.name),
      )}
      {scope(
        'groups',
        groups.map((g) => g.name),
      )}
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetCertificateExpiry',
  description: 'pageWidgets.widgetCertificateExpiryDesc',
  category: 'monitoring',
  defaultConfig: defaultCertificateConfig,
  parse: widgetCertificateExpiryWidget.parseConfig,
  View: ({ config }) => <CertificateView config={config as CertificateConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as CertificateConfig} onChange={onChange} />
  ),
  Gallery: () => <span aria-hidden="true">◇</span>,
};
