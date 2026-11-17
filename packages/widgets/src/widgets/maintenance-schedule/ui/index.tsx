import { CalendarClock } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { Empty, EmptyHeader, EmptyTitle } from '@homora/ui/empty';
import { Field, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Skeleton } from '@homora/ui/skeleton';
import { useEffect, useState } from 'react';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultMaintenanceConfig,
  widgetMaintenanceScheduleWidget,
  type MaintenanceConfig,
} from '../definition.js';
import { useMaintenanceReading, type MaintenanceReading } from './use-reading.js';

export function maintenanceFormatter(locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function MaintenanceView({ config }: { config: MaintenanceConfig }) {
  const { monitoring } = useWidgetHost();
  return (
    <MaintenanceContent reading={useMaintenanceReading(config, monitoring?.readMaintenance)} />
  );
}
export function MaintenanceContent({ reading }: { reading: MaintenanceReading }) {
  const { t, locale, openMonitor } = useWidgetHost();
  if (reading.status === 'loading')
    return (
      <div role="status" aria-label={t('maintenance.loading')}>
        <Skeleton className="h-10 w-full motion-reduce:animate-none" />
      </div>
    );
  if (reading.status === 'error')
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('maintenance.error')}
      </p>
    );
  const { data, stale } = reading;
  const format = maintenanceFormatter(locale);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('maintenance.stale', { time: format.format(data.generatedAt) })}
        </p>
      )}
      {data.items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('maintenance.timezone', { zone: format.resolvedOptions().timeZone })}
        </p>
      )}
      {data.items.length === 0 ? (
        <Empty className="gap-2 p-3 md:p-3">
          <EmptyHeader>
            <EmptyTitle className="text-sm">{t('maintenance.empty')}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y">
          {data.items.map((item) => {
            const state = t(
              item.startsAt <= data.generatedAt ? 'maintenance.ongoing' : 'maintenance.scheduled',
            );
            const start = t('maintenance.start', { time: format.format(item.startsAt) });
            const end = t('maintenance.end', { time: format.format(item.endsAt) });
            const action = t(item.hasService ? 'maintenance.open' : 'maintenance.openProbe');
            return (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!openMonitor}
                  onClick={() => openMonitor?.(item.monitorId, item.hasService)}
                  aria-label={`${item.name}, ${item.hasService ? '' : `${t('maintenance.probe')}, `}${state}, ${start}, ${end}, ${action}`}
                  className="h-auto min-h-11 w-full justify-start whitespace-normal px-1 py-2 text-left"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap gap-x-2">
                      <span className="break-words font-medium">{item.name}</span>
                      <span>{state}</span>
                      {!item.hasService && <span>{t('maintenance.probe')}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {start}
                      <br />
                      {end}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {data.total > data.items.length && (
        <p className="text-xs text-muted-foreground">
          {t('maintenance.showing', { shown: data.items.length, total: data.total })}
        </p>
      )}
    </div>
  );
}
function Editor({
  config,
  onChange,
}: {
  config: MaintenanceConfig;
  onChange: (config: MaintenanceConfig) => void;
}) {
  const { t, monitoring } = useWidgetHost();
  const readScopes = monitoring?.readScopes;
  const [options, setOptions] = useState<{
    pages: string[];
    groups: string[];
    loading: boolean;
    error: boolean;
  }>({ pages: [], groups: [], loading: true, error: false });
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (!readScopes) throw new Error('unavailable');
        const data = await readScopes(controller.signal);
        if (!controller.signal.aborted)
          setOptions({
            pages: data.pages.map((p) => p.name),
            groups: data.groups.map((g) => g.name),
            loading: false,
            error: false,
          });
      } catch {
        if (!controller.signal.aborted)
          setOptions({ pages: [], groups: [], loading: false, error: true });
      }
    };
    void load();
    return () => controller.abort();
  }, [readScopes]);
  const patch = (value: Partial<MaintenanceConfig>) => onChange({ ...config, ...value });
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="maintenance-days">{t('maintenance.horizon')}</FieldLabel>
        <FormSelect
          id="maintenance-days"
          value={String(config.days)}
          onChange={(event) => patch({ days: Number(event.target.value) as 1 | 7 | 30 })}
        >
          {[1, 7, 30].map((days) => (
            <FormSelectOption key={days} value={String(days)}>
              {t(`maintenance.${days === 1 ? '1day' : `${days}days`}`)}
            </FormSelectOption>
          ))}
        </FormSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="maintenance-limit">{t('maintenance.limit')}</FieldLabel>
        <FormSelect
          id="maintenance-limit"
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
      <p className="text-xs text-muted-foreground">{t('maintenance.scopeHint')}</p>
      {options.loading && <p role="status">{t('maintenance.loading')}</p>}
      {options.error && (
        <p role="alert" className="text-destructive">
          {t('maintenance.scopeError')}
        </p>
      )}
      {(['pages', 'groups'] as const).map((key) => (
        <fieldset key={key} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t(`maintenance.${key}`)}</legend>
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
      ))}
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetMaintenanceSchedule',
  description: 'pageWidgets.widgetMaintenanceScheduleDesc',
  category: 'monitoring',
  keywords: ['maintenance', 'schedule', 'manutenção', 'agenda'],
  defaultConfig: defaultMaintenanceConfig,
  parse: widgetMaintenanceScheduleWidget.parseConfig,
  View: ({ config }) => <MaintenanceView config={config as MaintenanceConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as MaintenanceConfig} onChange={onChange} />
  ),
  Gallery: () => <CalendarClock aria-hidden="true" />,
  canSubmit: (config) => !!widgetMaintenanceScheduleWidget.parseConfig(config),
};
