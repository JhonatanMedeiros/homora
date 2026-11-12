import { useEffect, useMemo, useState } from 'react';
import { UPTIME_RANGES } from '@homora/shared';
import { Clock } from '@/components/top-bar';
import { NativeSelect } from '@/components/native-select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useClockPreferences } from '@/hooks/use-clock-preferences';
import { useShortcutsPreference } from '@/hooks/use-shortcuts-preference';
import { useWebSearchPreferences } from '@/hooks/use-web-search-preferences';
import { useTheme } from '@/hooks/use-theme';
import { useTopBar } from '@/hooks/use-top-bar';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { locales, t, useI18n, type MessageKey } from '@/i18n';
import { browserTimeZone, listTimeZones } from '@/lib/clock';
import {
  CUSTOM_ENGINE,
  SEARCH_ENGINES,
  isEngineChoice,
  type TemplateProblem,
} from '@/lib/web-search';
import { Segmented } from './segmented';
import { SettingRow, SettingsGroup } from './setting-row';

const PROBLEM_MESSAGE: Record<TemplateProblem, MessageKey> = {
  placeholder: 'settings.ui.webSearchErrorPlaceholder',
  protocol: 'settings.ui.webSearchErrorProtocol',
  invalid: 'settings.ui.webSearchErrorInvalid',
};

/** Preferences kept in this browser only. */
export function InterfaceSettings() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useI18n();
  const { view, setView, showDescriptions, setShowDescriptions, uptimeRange, setUptimeRange } =
    useViewPreferences();
  const [topBar, setTopBar] = useTopBar();
  const clock = useClockPreferences();
  const [shortcuts, setShortcuts] = useShortcutsPreference();
  const search = useWebSearchPreferences();
  const [customDraft, setCustomDraft] = useState(search.customUrl);
  const [customProblem, setCustomProblem] = useState<TemplateProblem | null>(null);
  const [connections, setConnections] = useState<{ id: number; name: string; type: string }[]>([]);
  const [source, setSource] = useState(() => {
    try {
      return localStorage.getItem('homora-top-bar-connection') ?? '';
    } catch {
      return '';
    }
  });
  const timeZones = useMemo(() => listTimeZones(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/connections', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data))
          setConnections(
            data.filter(
              (item) =>
                item?.type === 'proxmox' &&
                Number.isSafeInteger(item.id) &&
                typeof item.name === 'string',
            ),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">{t('settings.ui.browserOnly')}</p>

      <SettingsGroup id="ui-appearance" title={t('settings.ui.appearance')}>
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
          <NativeSelect
            id="ui-language"
            className="sm:w-56"
            value={locale}
            onChange={(event) => {
              const next = locales.find((item) => item.id === event.target.value);
              if (next) setLocale(next.id);
            }}
          >
            {locales.map((item) => (
              <option key={item.id} value={item.id} lang={item.id}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="ui-home" title={t('settings.ui.home')}>
        <SettingRow label={t('settings.ui.layout')} description={t('settings.ui.layoutHint')}>
          <Segmented
            label={t('settings.ui.layout')}
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('view.list') },
              { value: 'cards', label: t('view.cards') },
            ]}
          />
        </SettingRow>
        <SettingRow
          htmlFor="ui-descriptions"
          label={t('settings.ui.descriptions')}
          description={t('settings.ui.descriptionsHint')}
        >
          <Switch
            id="ui-descriptions"
            checked={showDescriptions}
            disabled={view !== 'cards'}
            onCheckedChange={setShowDescriptions}
          />
        </SettingRow>
        <SettingRow label={t('settings.ui.uptime')} description={t('settings.ui.uptimeHint')}>
          <Segmented
            label={t('settings.ui.uptime')}
            value={uptimeRange}
            onChange={setUptimeRange}
            options={UPTIME_RANGES.map((range) => ({
              value: range,
              label: t(`uptime.range.${range}`),
            }))}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="ui-keyboard" title={t('settings.ui.keyboardSection')}>
        <SettingRow
          htmlFor="ui-shortcuts"
          label={t('settings.ui.shortcuts')}
          description={t('settings.ui.shortcutsHint')}
        >
          <Switch id="ui-shortcuts" checked={shortcuts} onCheckedChange={setShortcuts} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="ui-search" title={t('settings.ui.searchSection')}>
        <SettingRow
          htmlFor="ui-web-search"
          label={t('settings.ui.webSearch')}
          description={t('settings.ui.webSearchHint')}
        >
          <Switch id="ui-web-search" checked={search.enabled} onCheckedChange={search.setEnabled} />
        </SettingRow>
        {search.enabled && (
          <>
            <SettingRow htmlFor="ui-web-search-engine" label={t('settings.ui.webSearchEngine')}>
              <NativeSelect
                id="ui-web-search-engine"
                className="sm:w-56"
                value={search.engine}
                onChange={(event) => {
                  if (isEngineChoice(event.target.value)) search.setEngine(event.target.value);
                }}
              >
                {SEARCH_ENGINES.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.label}
                  </option>
                ))}
                <option value={CUSTOM_ENGINE}>{t('settings.ui.webSearchCustom')}</option>
              </NativeSelect>
            </SettingRow>
            {search.engine === CUSTOM_ENGINE && (
              <SettingRow
                htmlFor="ui-web-search-url"
                label={t('settings.ui.webSearchUrl')}
                description={
                  customProblem ? undefined : (
                    <span id="ui-web-search-url-hint">
                      {search.template
                        ? t('settings.ui.webSearchUrlHint')
                        : t('settings.ui.webSearchUnusable')}
                    </span>
                  )
                }
              >
                <div className="flex w-full flex-col gap-1 sm:w-80">
                  <Input
                    id="ui-web-search-url"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('settings.ui.webSearchUrlPlaceholder')}
                    value={customDraft}
                    aria-invalid={customProblem ? true : undefined}
                    aria-describedby="ui-web-search-url-error"
                    onChange={(event) => {
                      setCustomDraft(event.target.value);
                      setCustomProblem(search.setCustomUrl(event.target.value.trim()));
                    }}
                  />
                  <p
                    id="ui-web-search-url-error"
                    role="alert"
                    className="text-sm text-destructive empty:hidden"
                  >
                    {customProblem && t(PROBLEM_MESSAGE[customProblem])}
                  </p>
                </div>
              </SettingRow>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup id="ui-top-bar" title={t('settings.ui.topBarSection')}>
        <SettingRow
          htmlFor="top-bar"
          label={t('settings.topBar')}
          description={t('settings.topBarHint')}
        >
          <Switch id="top-bar" checked={topBar} onCheckedChange={setTopBar} />
        </SettingRow>
        {topBar && (
          <>
            <SettingRow
              htmlFor="top-bar-date"
              label={t('settings.ui.date')}
              description={t('settings.ui.dateHint')}
            >
              <Switch id="top-bar-date" checked={clock.date} onCheckedChange={clock.setDate} />
            </SettingRow>
            <SettingRow
              htmlFor="top-bar-seconds"
              label={t('settings.ui.seconds')}
              description={t('settings.ui.secondsHint')}
            >
              <Switch
                id="top-bar-seconds"
                checked={clock.seconds}
                onCheckedChange={clock.setSeconds}
              />
            </SettingRow>
            <SettingRow label={t('settings.ui.hours')} description={t('settings.ui.hoursHint')}>
              <Segmented
                label={t('settings.ui.hours')}
                value={clock.hourFormat}
                onChange={clock.setHourFormat}
                options={[
                  { value: 'auto', label: t('settings.ui.hoursAuto') },
                  { value: '12h', label: t('settings.ui.hours12') },
                  { value: '24h', label: t('settings.ui.hours24') },
                ]}
              />
            </SettingRow>
            <SettingRow
              htmlFor="top-bar-zone"
              label={t('settings.ui.timeZone')}
              description={t('settings.ui.timeZoneHint')}
            >
              <NativeSelect
                id="top-bar-zone"
                className="sm:w-64"
                value={clock.timeZone}
                onChange={(event) => clock.setTimeZone(event.target.value)}
              >
                <option value="">
                  {t('settings.ui.timeZoneBrowser', { zone: browserTimeZone() })}
                </option>
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll('_', ' ')}
                  </option>
                ))}
              </NativeSelect>
            </SettingRow>
            {(connections.length > 0 || source) && (
              <SettingRow
                htmlFor="top-bar-source"
                label={t('settings.topBarSource')}
                description={t('settings.ui.topBarSourceHint')}
              >
                <NativeSelect
                  id="top-bar-source"
                  className="sm:w-64"
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    try {
                      localStorage.setItem('homora-top-bar-connection', event.target.value);
                    } catch {
                      /* Preference is unavailable without browser storage. */
                    }
                  }}
                >
                  <option value="">{t('settings.topBarAutomatic')}</option>
                  {source &&
                    !connections.some((connection) => String(connection.id) === source) && (
                      <option value={source}>{t('settings.topBarMissing')}</option>
                    )}
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name}
                    </option>
                  ))}
                </NativeSelect>
              </SettingRow>
            )}
          </>
        )}
        <div className="flex flex-col gap-2 p-4">
          <span className="font-mono text-xs text-muted-foreground">
            {t('settings.ui.preview')}
          </span>
          {topBar ? (
            <div className="rounded-md border bg-background px-4 py-2">
              <Clock preferences={clock} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('settings.ui.previewOff')}</p>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
}
