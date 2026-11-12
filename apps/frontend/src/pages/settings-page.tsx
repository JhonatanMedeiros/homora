import { useEffect, useState } from 'react';
import { NativeSelect } from '@/components/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useTopBar } from '@/hooks/use-top-bar';
import { PageHeader } from '@/components/page-header';
import { Discovery } from '@/features/discovery/discovery';
import { ConfigTransfer } from '@/features/transfer/config-transfer';
import { PublicStatusSettings } from '@/features/public-status/public-status-settings';
import { t } from '@/i18n';

export function SettingsPage({ onImported }: { onImported: () => void | Promise<void> }) {
  const [topBar, setTopBar] = useTopBar();
  const [connections, setConnections] = useState<{ id: number; name: string; type: string }[]>([]);
  const [source, setSource] = useState(() => {
    try {
      return localStorage.getItem('homora-top-bar-connection') ?? '';
    } catch {
      return '';
    }
  });
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
    <section aria-label={t('settings.title')} className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <Field orientation="horizontal" className="items-start">
        <Checkbox
          id="top-bar"
          checked={topBar}
          onCheckedChange={(checked) => setTopBar(checked === true)}
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="top-bar">{t('settings.topBar')}</FieldLabel>
          <FieldDescription>{t('settings.topBarHint')}</FieldDescription>
        </div>
      </Field>
      {topBar && (connections.length > 0 || source) && (
        <Field>
          <FieldLabel htmlFor="top-bar-source">{t('settings.topBarSource')}</FieldLabel>
          <NativeSelect
            id="top-bar-source"
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
            {source && !connections.some((connection) => String(connection.id) === source) && (
              <option value={source}>{t('settings.topBarMissing')}</option>
            )}
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <PublicStatusSettings />
      <ConfigTransfer onImported={onImported} />
      <Discovery onImported={onImported} />
    </section>
  );
}
