import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { useTheme } from '@/hooks/use-theme';
import { locales, t, useI18n } from '@/i18n';
import { AppearanceSettings } from './appearance-settings';
import { CustomCssSettings } from './custom-css-settings';
import { Segmented } from './segmented';
import { SettingRow, SettingsGroup } from './setting-row';

/** Rarely changed settings, folded away. Opens by itself when sent here to fix broken custom CSS. */
function AdvancedSettings() {
  const state: unknown = useLocation().state;
  const [open, setOpen] = useState(
    Boolean(state && typeof state === 'object' && 'advanced' in state && state.advanced),
  );
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-between px-4 py-3 text-left"
        >
          <span className="flex flex-col items-start gap-0.5">
            <span className="font-medium">{t('css.title')}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {t('settings.ui.advancedHint')}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={
              open ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
            }
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CustomCssSettings />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Theme, language, accent, background and custom CSS. */
export function InterfaceSettings() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        id="ui-appearance"
        title={t('settings.ui.appearance')}
        hint={t('settings.ui.browserShort')}
      >
        <SettingRow label={t('settings.ui.theme')} description={t('settings.ui.themeHint')}>
          <Segmented
            label={t('settings.ui.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('settings.ui.light') },
              { value: 'dark', label: t('settings.ui.dark') },
            ]}
          />
        </SettingRow>
        <SettingRow
          htmlFor="ui-language"
          label={t('settings.ui.language')}
          description={t('settings.ui.languageHint')}
        >
          <FormSelect
            id="ui-language"
            aria-label={t('settings.ui.language')}
            className="sm:w-56"
            value={locale}
            onChange={(event) => {
              const next = locales.find((item) => item.id === event.target.value);
              if (next) setLocale(next.id);
            }}
          >
            {locales.map((item) => (
              <FormSelectOption key={item.id} value={item.id} lang={item.id}>
                {item.label}
              </FormSelectOption>
            ))}
          </FormSelect>
        </SettingRow>
      </SettingsGroup>

      <AppearanceSettings />

      <AdvancedSettings />
    </div>
  );
}
