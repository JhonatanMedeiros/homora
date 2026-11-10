import { PageHeader } from '@/components/page-header';
import { Proxmox } from '@/features/proxmox/proxmox';
import { Connections } from '@/features/connections/connections';
import { IntegrationCatalog } from '@/features/integrations/integration-catalog';
import { t } from '@/i18n';

export function IntegrationsPage() {
  return (
    <section aria-label={t('integrations.title')} className="flex flex-col gap-6">
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />
      <Proxmox />
      <Connections />
      <IntegrationCatalog />
    </section>
  );
}
