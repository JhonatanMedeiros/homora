import { useEffect, useState } from 'react';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isTimeZone, listTimeZones } from '../../../time-zone.js';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultCalendarConfig,
  firstWeekday,
  monthDays,
  todayInZone,
  widgetCalendarWidget,
  type CalendarConfig,
} from '../definition.js';

function useToday(zone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        setNow(new Date());
        timer = window.setTimeout(update, 60_000 - (Date.now() % 60_000));
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return todayInZone(now, zone);
}
export function CalendarView({ config }: { config: CalendarConfig }) {
  const { locale, t } = useWidgetHost();
  const today = useToday(config.timeZone);
  const [display, setDisplay] = useState<{ year: number; month: number } | null>(null);
  const year = display?.year ?? today.getUTCFullYear();
  const month = display?.month ?? today.getUTCMonth();
  const first = firstWeekday(locale, config.weekStart);
  const days = monthDays(year, month, first);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1)));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
  const move = (amount: number) => {
    const date = new Date(Date.UTC(year, month + amount, 1));
    setDisplay({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  };
  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t('pageWidgets.calendarPrevious')}
          onClick={() => move(-1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-center text-sm font-medium capitalize">{monthLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t('pageWidgets.calendarNext')}
          onClick={() => move(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <table
        aria-label={monthLabel}
        className="w-full table-fixed text-center text-sm tabular-nums"
      >
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date(Date.UTC(2023, 0, 1 + ((first + i) % 7)));
              return (
                <th
                  key={i}
                  scope="col"
                  className="py-1 font-normal text-muted-foreground"
                  title={new Intl.DateTimeFormat(locale, {
                    weekday: 'long',
                    timeZone: 'UTC',
                  }).format(date)}
                >
                  {weekday.format(date)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: days.length / 7 }, (_, week) => (
            <tr key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const current = day.getTime() === today.getTime();
                return (
                  <td
                    key={day.toISOString()}
                    aria-label={fullDate.format(day)}
                    aria-current={current ? 'date' : undefined}
                    className="h-9 p-0"
                  >
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-full ${current ? 'bg-primary font-semibold text-primary-foreground' : day.getUTCMonth() === month ? '' : 'text-muted-foreground'}`}
                    >
                      {day.getUTCDate()}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-center">
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setDisplay(null)}>
          {t('pageWidgets.calendarToday')}
        </Button>
      </div>
    </div>
  );
}
function Editor({
  config,
  onChange,
}: {
  config: CalendarConfig;
  onChange: (config: CalendarConfig) => void;
}) {
  const { t, locale } = useWidgetHost();
  const invalidZone = !!config.timeZone && !isTimeZone(config.timeZone);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="calendar-week-start">{t('pageWidgets.calendarWeekStart')}</FieldLabel>
        <FormSelect
          id="calendar-week-start"
          value={config.weekStart}
          onChange={(event) =>
            onChange({ ...config, weekStart: event.target.value as CalendarConfig['weekStart'] })
          }
        >
          <FormSelectOption value="auto">{t('pageWidgets.calendarAuto')}</FormSelectOption>
          {Array.from({ length: 7 }, (_, i) => (
            <FormSelectOption key={i} value={String(i)}>
              {weekday.format(new Date(Date.UTC(2023, 0, 1 + i)))}
            </FormSelectOption>
          ))}
        </FormSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="calendar-zone">{t('settings.ui.timeZone')}</FieldLabel>
        <FormSelect
          id="calendar-zone"
          value={config.timeZone}
          onChange={(event) => onChange({ ...config, timeZone: event.target.value })}
        >
          {invalidZone && (
            <FormSelectOption value={config.timeZone}>{config.timeZone}</FormSelectOption>
          )}
          <FormSelectOption value="">
            {t('settings.ui.timeZoneBrowser', {
              zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            })}
          </FormSelectOption>
          {listTimeZones().map((zone) => (
            <FormSelectOption key={zone} value={zone}>
              {zone}
            </FormSelectOption>
          ))}
        </FormSelect>
        {invalidZone && <FieldDescription>{t('pageWidgets.calendarInvalidZone')}</FieldDescription>}
      </Field>
    </>
  );
}
const parse = (value: unknown) => {
  const parsed = widgetCalendarWidget.parseConfig(value);
  if (parsed) return parsed;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  if (typeof config.timeZone !== 'string' || !config.timeZone || isTimeZone(config.timeZone))
    return null;
  return widgetCalendarWidget.parseConfig({ ...config, timeZone: '' })
    ? (config as CalendarConfig)
    : null;
};
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetCalendar',
  description: 'pageWidgets.widgetCalendarDesc',
  category: 'time',
  keywords: ['month', 'week', 'schedule', 'mês', 'semana', 'calendário', 'agenda'],
  defaultConfig: defaultCalendarConfig,
  parse,
  View: ({ config }) => <CalendarView config={config as CalendarConfig} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as CalendarConfig} onChange={onChange} />
  ),
  Gallery: () => <span aria-hidden="true">▦</span>,
  canSubmit: (config) => !!widgetCalendarWidget.parseConfig(config),
};
