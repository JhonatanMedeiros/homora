import { CheckCircle2, ListChecks } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@homora/ui/empty';
import { Field, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Skeleton } from '@homora/ui/skeleton';
import { monitoringReasonKey } from '../../../monitoring-reason.js';
import { useWidgetHost, type MonitoringProblemsReading } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import { useProblemsReading, useScopeOptions } from './use-reading.js';
import { widgetProblemsWidget, type ProblemsConfig } from '../definition.js';

function relativeTime(instant: number | null, now: number, locale: string, fallback: string) {
  if (instant === null) return fallback;
  const seconds = Math.max(0, Math.floor((now - instant) / 1000));
  const [amount, unit] =
    seconds >= 86400
      ? ([Math.floor(seconds / 86400), 'day'] as const)
      : seconds >= 3600
        ? ([Math.floor(seconds / 3600), 'hour'] as const)
        : seconds >= 60
          ? ([Math.floor(seconds / 60), 'minute'] as const)
          : ([seconds, 'second'] as const);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-amount, unit);
}

export function ProblemsView({ config }: { config: ProblemsConfig }) {
  const { monitoring } = useWidgetHost();
  const reading = useProblemsReading(config, monitoring?.readProblems);
  return <ProblemsContent reading={reading} />;
}

export function ProblemsContent({ reading }: { reading: MonitoringProblemsReading }) {
  const { t, locale, openMonitor } = useWidgetHost();
  if (reading.status === 'loading')
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('problems.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-2 py-1">
              <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    );
  if (reading.status === 'error')
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('problems.error')}
      </p>
    );
  const { data, now, stale } = reading;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('problems.stale', {
            time: relativeTime(data.generatedAt, now, locale, t('problems.now')),
          })}
        </p>
      )}
      {data.items.length === 0 ? (
        <Empty className="gap-2 p-3 md:p-3">
          <EmptyHeader>
            <EmptyMedia>
              <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
            </EmptyMedia>
            <EmptyTitle className="text-sm">{t('problems.empty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.items.map((item) => {
            const state = t(item.state === 'down' ? 'problems.offline' : 'problems.degraded');
            const relative = relativeTime(item.since, now, locale, t('problems.now'));
            const time =
              item.state === 'degraded' && item.since !== null
                ? t('problems.observed', { time: relative })
                : relative;
            const reason =
              item.state === 'degraded'
                ? t('problems.latency', {
                    latency: new Intl.NumberFormat(locale).format(item.latencyMs ?? 0),
                  })
                : t(monitoringReasonKey(item.reason, item.httpStatus), {
                    code: item.httpStatus ?? 0,
                  });
            return (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-11 w-full justify-start whitespace-normal px-1 py-2 text-left"
                  aria-label={t(item.isService ? 'problems.open' : 'problems.openProbe', {
                    name: item.name,
                    state,
                    time,
                  })}
                  onClick={() => openMonitor?.(item.id, item.isService)}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="break-words font-medium">{item.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {state} · {reason} · {time}
                    </span>
                    {item.stale && item.lastAttempt !== null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {t('problems.lastCheck', {
                          time: relativeTime(item.lastAttempt, now, locale, t('problems.now')),
                        })}
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
          {t('problems.showing', { shown: data.items.length, total: data.total })}
        </p>
      )}
      {data.unmeasured > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('problems.unmeasured', { count: data.unmeasured })}
        </p>
      )}
    </div>
  );
}

function Editor({
  config,
  onChange,
}: {
  config: ProblemsConfig;
  onChange: (config: ProblemsConfig) => void;
}) {
  const { t, monitoring } = useWidgetHost();
  const options = useScopeOptions(monitoring?.readScopes);
  const patch = (value: Partial<ProblemsConfig>) => onChange({ ...config, ...value });
  const scope = (key: 'pages' | 'groups') => (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{t(`problems.${key}`)}</legend>
      {Array.from(new Set([...options[key], ...config[key]])).map((name) => (
        <label key={name} className="flex min-h-9 items-center gap-2 text-sm">
          <Checkbox
            checked={config[key].includes(name)}
            onCheckedChange={(checked) =>
              patch({
                [key]:
                  checked === true
                    ? [...config[key], name]
                    : config[key].filter((entry) => entry !== name),
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
        <FieldLabel htmlFor="problems-limit">{t('problems.limit')}</FieldLabel>
        <FormSelect
          id="problems-limit"
          value={String(config.limit)}
          onChange={(event) => patch({ limit: Number(event.target.value) })}
        >
          {Array.from({ length: 10 }, (_, index) => (
            <FormSelectOption key={index + 1} value={String(index + 1)}>
              {index + 1}
            </FormSelectOption>
          ))}
        </FormSelect>
      </Field>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <Checkbox
          checked={config.includeDegraded}
          onCheckedChange={(checked) => patch({ includeDegraded: checked === true })}
        />
        {t('problems.includeDegraded')}
      </label>
      <p className="text-xs text-muted-foreground">{t('problems.scopeHint')}</p>
      {options.loading && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('problems.loading')}
        </p>
      )}
      {options.error && (
        <p role="alert" className="text-xs text-destructive">
          {t('problems.scopeError')}
        </p>
      )}
      {scope('pages')}
      {scope('groups')}
    </div>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetProblems',
  description: 'pageWidgets.widgetProblemsDesc',
  defaultConfig: widgetProblemsWidget.defaultConfig,
  parse: widgetProblemsWidget.parseConfig,
  View: ({ config }) => <ProblemsView config={config as ProblemsConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as ProblemsConfig} onChange={onChange} />
  ),
  Gallery: () => <ListChecks aria-hidden="true" />,
};
