import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Input } from '@homora/ui/input';
import { Checkbox } from '@homora/ui/checkbox';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultRecentIncidentsConfig,
  incidentDuration,
  recentIncidents,
  widgetRecentIncidentsWidget,
  type RecentIncidentsConfig,
} from '../definition.js';

export function RecentIncidentsView({ config }: { config: RecentIncidentsConfig }) {
  const { t, locale, incidentReading, openMonitor, wide } = useWidgetHost();
  const reading = incidentReading ?? { status: 'error' as const };
  if (reading.status === 'loading')
    return (
      <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (reading.status === 'error')
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('incWidget.error')}
      </p>
    );
  const now = Date.now();
  const items = recentIncidents(reading.data.items, config, now);
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {reading.stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('incWidget.stale')}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('incWidget.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const start = format.format(item.startedAt);
            const end = item.endedAt === null ? null : format.format(item.endedAt);
            const duration = incidentDuration((item.endedAt ?? now) - item.startedAt, locale);
            const spokenDuration = incidentDuration(
              (item.endedAt ?? now) - item.startedAt,
              locale,
              'long',
            );
            const description =
              end === null
                ? t('incWidget.ongoingSince', { start })
                : t('incWidget.resolved', { start, end });
            const reason = `${t(`incWidget.reason.${item.reason}`)}${item.httpStatus !== null && (item.reason === 'error-status' || item.reason === 'unexpected-status') ? ` (${item.httpStatus})` : ''}`;
            return (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!openMonitor}
                  onClick={() => openMonitor?.(item.monitorId, item.hasService)}
                  aria-label={`${item.name}, ${description}, ${spokenDuration}${item.hasService ? '' : `, ${t('incWidget.openProbe')}`}`}
                  className="h-auto min-h-11 w-full justify-start whitespace-normal px-2 py-2 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="break-words font-medium">{item.name}</span>
                      {end === null && (
                        <span className="text-destructive">{t('incWidget.ongoing')}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {start}
                      {end !== null && (
                        <>
                          {' '}
                          <span aria-hidden="true">→</span> {end}
                        </>
                      )}{' '}
                      · {duration}
                    </span>
                    {wide && (
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {t('incWidget.reason', { reason })}
                      </span>
                    )}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {reading.data.truncated && (
        <p className="text-xs text-muted-foreground">{t('incWidget.truncated')}</p>
      )}
    </div>
  );
}
function Editor({
  config,
  onChange,
}: {
  config: RecentIncidentsConfig;
  onChange: (config: RecentIncidentsConfig) => void;
}) {
  const { t, groups = [], pages = [] } = useWidgetHost();
  const options = (key: 'groups' | 'pages', values: string[]) => (
    <Field>
      <FieldLabel>{t(`incWidget.${key}`)}</FieldLabel>
      <FieldDescription>{t('incWidget.all')}</FieldDescription>
      <div className="flex max-h-36 flex-col gap-2 overflow-auto">
        {[...new Set([...values, ...config[key]])].map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config[key].includes(name)}
              onCheckedChange={(checked) =>
                onChange({
                  ...config,
                  [key]:
                    checked === true
                      ? [...config[key], name]
                      : config[key].filter((value) => value !== name),
                })
              }
            />
            {name}
          </label>
        ))}
      </div>
    </Field>
  );
  return (
    <>
      <Field>
        <FieldLabel htmlFor="inc-period">{t('incWidget.period')}</FieldLabel>
        <FormSelect
          id="inc-period"
          value={String(config.periodDays)}
          onChange={(e) =>
            onChange({ ...config, periodDays: Number(e.target.value) as 1 | 7 | 30 })
          }
        >
          <FormSelectOption value="1">{t('incWidget.1day')}</FormSelectOption>
          <FormSelectOption value="7">{t('incWidget.7days')}</FormSelectOption>
          <FormSelectOption value="30">{t('incWidget.30days')}</FormSelectOption>
        </FormSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="inc-limit">{t('incWidget.limit')}</FieldLabel>
        <Input
          id="inc-limit"
          type="number"
          min={1}
          max={10}
          value={config.limit}
          onChange={(e) => onChange({ ...config, limit: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="inc-minimum">{t('incWidget.minimum')}</FieldLabel>
        <Input
          id="inc-minimum"
          type="number"
          min={0}
          max={43200}
          value={config.minimumMinutes}
          onChange={(e) => onChange({ ...config, minimumMinutes: Number(e.target.value) })}
        />
      </Field>
      {options(
        'pages',
        pages.map((p) => p.name),
      )}
      {options(
        'groups',
        groups.map((g) => g.name),
      )}
    </>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetRecentIncidents',
  description: 'pageWidgets.widgetRecentIncidentsDesc',
  defaultConfig: defaultRecentIncidentsConfig,
  parse: widgetRecentIncidentsWidget.parseConfig,
  monitoringQuery: (value) => {
    const c = value as RecentIncidentsConfig;
    return {
      days: c.periodDays,
      limit: c.limit,
      minimumMinutes: c.minimumMinutes,
      groups: c.groups,
      pages: c.pages,
    };
  },
  View: ({ config }) => <RecentIncidentsView config={config as RecentIncidentsConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as RecentIncidentsConfig} onChange={onChange} />
  ),
  Gallery: () => <span aria-hidden="true">◷</span>,
  canSubmit: (config) => !!widgetRecentIncidentsWidget.parseConfig(config),
};
