import { PageHeader } from '@/components/page-header';
import { ConfigTransfer } from '@/features/transfer/config-transfer';
import { t } from '@/i18n';

export function SettingsPage({ onImported }: { onImported: () => void | Promise<void> }) {
  return (
    <section aria-label={t('settings.title')} className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <ConfigTransfer onImported={onImported} />
    </section>
  );
}
