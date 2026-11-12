import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { t } from '@/i18n';
import { SettingRow, SettingsGroup } from './setting-row';

/** Instance-wide monitoring defaults, kept on the server. */
export function MonitoringSettings() {
  const [allowPrivate, setAllowPrivate] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/service-defaults', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ allowPrivate: boolean }>;
      })
      .then((data) => setAllowPrivate(data.allowPrivate === true))
      .catch(() => {
        if (!controller.signal.aborted) setError(t('settings.monitoring.loadError'));
      });
    return () => controller.abort();
  }, []);
  async function change(next: boolean) {
    setError('');
    try {
      const response = await fetch('/api/service-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowPrivate: next }),
      });
      if (!response.ok) throw new Error();
      setAllowPrivate(next);
    } catch {
      setError(t('settings.monitoring.saveError'));
    }
  }
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
    </div>
  );
}
