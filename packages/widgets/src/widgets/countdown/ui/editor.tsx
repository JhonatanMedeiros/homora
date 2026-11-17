import { useWidgetHost } from '../../../ui/host.js';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Field, FieldLabel } from '@homora/ui/field';
import { useState } from 'react';
import { enUS, ptBR } from 'date-fns/locale';
import { Calendar } from '@homora/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { FieldGroup } from '@homora/ui/field';
import { CalendarDays } from 'lucide-react';
import { type CountdownConfig } from '../../../countdown.js';
import { listTimeZones } from '../../../time-zone.js';
export function Editor({
  config,
  onChange,
}: {
  config: CountdownConfig;
  onChange: (config: CountdownConfig) => void;
}) {
  const { t, locale } = useWidgetHost();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const setConfig = (patch: Partial<CountdownConfig>) => onChange({ ...config, ...patch });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="pw-event">{t('pageWidgets.eventName')}</FieldLabel>
        <Input
          id="pw-event"
          required
          maxLength={60}
          value={config.eventName}
          onChange={(event) => setConfig({ eventName: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-target">{t('pageWidgets.eventDate')}</FieldLabel>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button id="pw-target" type="button" variant="outline" className="justify-start">
              <CalendarDays data-icon="inline-start" />
              {config.localDateTime
                ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`),
                  ) + `, ${config.localDateTime.slice(11)}`
                : t('pageWidgets.chooseDate')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={locale === 'pt-BR' ? ptBR : enUS}
              selected={
                config.localDateTime
                  ? new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`)
                  : undefined
              }
              defaultMonth={
                config.localDateTime
                  ? new Date(`${config.localDateTime.slice(0, 10)}T12:00:00`)
                  : undefined
              }
              onSelect={(date) => {
                if (!date) return;
                const day = `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                setConfig({
                  localDateTime: `${day}T${config.localDateTime.slice(11) || '00:00'}`,
                });
              }}
            />
            <FieldGroup className="gap-3 border-t p-3">
              <Field>
                <FieldLabel htmlFor="pw-hour">{t('pageWidgets.eventHour')}</FieldLabel>
                <FormSelect
                  id="pw-hour"
                  disabled={!config.localDateTime}
                  value={config.localDateTime.slice(11, 13) || '00'}
                  onChange={(event) =>
                    setConfig({
                      localDateTime: `${config.localDateTime.slice(0, 11)}${event.target.value}:${config.localDateTime.slice(14, 16)}`,
                    })
                  }
                >
                  {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')).map(
                    (hour) => (
                      <FormSelectOption key={hour} value={hour}>
                        {hour}
                      </FormSelectOption>
                    ),
                  )}
                </FormSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="pw-minute">{t('pageWidgets.eventMinute')}</FieldLabel>
                <FormSelect
                  id="pw-minute"
                  disabled={!config.localDateTime}
                  value={config.localDateTime.slice(14, 16) || '00'}
                  onChange={(event) =>
                    setConfig({
                      localDateTime: `${config.localDateTime.slice(0, 14)}${event.target.value}`,
                    })
                  }
                >
                  {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map(
                    (minute) => (
                      <FormSelectOption key={minute} value={minute}>
                        {minute}
                      </FormSelectOption>
                    ),
                  )}
                </FormSelect>
              </Field>
              <Button type="button" variant="outline" onClick={() => setCalendarOpen(false)}>
                {t('pageWidgets.dateTimeDone')}
              </Button>
            </FieldGroup>
          </PopoverContent>
        </Popover>
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-countdown-zone">{t('settings.ui.timeZone')}</FieldLabel>
        <FormSelect
          id="pw-countdown-zone"
          value={config.timeZone}
          onChange={(event) => setConfig({ timeZone: event.target.value })}
        >
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
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-past">{t('pageWidgets.pastBehavior')}</FieldLabel>
        <FormSelect
          id="pw-past"
          value={config.pastBehavior}
          onChange={(event) =>
            setConfig({
              pastBehavior: event.target.value as CountdownConfig['pastBehavior'],
            })
          }
        >
          <FormSelectOption value="keep">{t('pageWidgets.keepPast')}</FormSelectOption>
          <FormSelectOption value="hide">{t('pageWidgets.hidePast')}</FormSelectOption>
        </FormSelect>
      </Field>
    </>
  );
}
