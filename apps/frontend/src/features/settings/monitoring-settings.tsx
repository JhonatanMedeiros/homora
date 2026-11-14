import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useMonitoringDefaults } from './use-monitoring-defaults';
import { MonitoringTrustSettings } from './monitoring-trust-settings';
import { t } from '@/i18n';
import { SettingRow, SettingsGroup } from './setting-row';

/** Instance-wide monitoring defaults, kept on the server. */
export function MonitoringSettings() {
  const { allowPrivate, error, change } = useMonitoringDefaults();
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <SettingsGroup id="monitoring-new-services" title={t('settings.monitoring.defaults')}>
        <SettingRow
          htmlFor="new-services-private"
          label={t('settings.monitoring.allowPrivate')}
          description={t('settings.monitoring.allowPrivateHint')}
        >
          <Switch
            id="new-services-private"
            checked={allowPrivate === true}
            disabled={allowPrivate === null}
            onCheckedChange={(checked) => void change(checked)}
          />
        </SettingRow>
      </SettingsGroup>
      <MonitoringTrustSettings />
    </div>
  );
}
