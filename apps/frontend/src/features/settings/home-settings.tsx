import { UPTIME_RANGES } from '@homora/shared';
import { Switch } from '@/components/ui/switch';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { t } from '@/i18n';
import { PagesSettings } from './pages-settings';
import { Segmented } from './segmented';
import { SettingRow, SettingsGroup } from './setting-row';

/** How the dashboard lists services, and its pages. */
export function HomeSettings({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const {
    view,
    setView,
    showDescriptions,
    setShowDescriptions,
    uptimeRange,
    setUptimeRange,
    collapseHealthy,
    setCollapseHealthy,
    problemsFirst,
    setProblemsFirst,
  } = useViewPreferences();
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        id="ui-home"
        title={t('settings.ui.home')}
        hint={t('settings.ui.browserShort')}
      >
        <SettingRow label={t('settings.ui.layout')} description={t('settings.ui.layoutHint')}>
          <Segmented
            label={t('settings.ui.layout')}
            value={view}
            onChange={setView}
            options={[
              { value: 'tiles', label: t('view.compact') },
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
        <SettingRow
          htmlFor="ui-collapse-healthy"
          label={t('settings.ui.collapseHealthy')}
          description={t('settings.ui.collapseHealthyHint')}
        >
          <Switch
            id="ui-collapse-healthy"
            checked={collapseHealthy}
            onCheckedChange={setCollapseHealthy}
          />
        </SettingRow>
        <SettingRow
          htmlFor="ui-problems-first"
          label={t('settings.ui.problemsFirst')}
          description={t('settings.ui.problemsFirstHint')}
        >
          <Switch
            id="ui-problems-first"
            checked={problemsFirst}
            onCheckedChange={setProblemsFirst}
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

      <PagesSettings onChanged={onChanged} />
    </div>
  );
}
