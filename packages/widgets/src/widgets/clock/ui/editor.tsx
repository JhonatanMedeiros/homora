import { useWidgetHost } from '../../../ui/host.js';
import { FormSelect, FormSelectOption } from '@homora/ui/form-select';
import { Field, FieldLabel } from '@homora/ui/field';
import { Switch } from '@homora/ui/switch';
import { type ClockConfig } from '../../../clock.js';
import { listTimeZones } from '../../../clock.js';
export function Editor({
  config,
  onChange,
}: {
  config: ClockConfig;
  onChange: (config: ClockConfig) => void;
}) {
  const { t } = useWidgetHost();
  const setConfig = (patch: Partial<ClockConfig>) => onChange({ ...config, ...patch });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="pw-zone">{t('settings.ui.timeZone')}</FieldLabel>
        <FormSelect
          id="pw-zone"
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
        <FieldLabel htmlFor="pw-hours">{t('settings.ui.hours')}</FieldLabel>
        <FormSelect
          id="pw-hours"
          value={config.hourFormat}
          onChange={(event) =>
            setConfig({ hourFormat: event.target.value as ClockConfig['hourFormat'] })
          }
        >
          <FormSelectOption value="auto">{t('settings.ui.hoursAuto')}</FormSelectOption>
          <FormSelectOption value="12h">{t('settings.ui.hours12')}</FormSelectOption>
          <FormSelectOption value="24h">{t('settings.ui.hours24')}</FormSelectOption>
        </FormSelect>
      </Field>
      <Field orientation="horizontal">
        <Switch
          id="pw-date"
          checked={config.date}
          onCheckedChange={(date) => setConfig({ date })}
        />
        <FieldLabel htmlFor="pw-date">{t('settings.ui.date')}</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Switch
          id="pw-seconds"
          checked={config.seconds}
          onCheckedChange={(seconds) => setConfig({ seconds })}
        />
        <FieldLabel htmlFor="pw-seconds">{t('settings.ui.seconds')}</FieldLabel>
      </Field>
    </>
  );
}
