import { PageHeader } from '@/components/page-header';
import { Proxmox } from '@/features/proxmox/proxmox';
import { Connections } from '@/features/connections/connections';
import { IntegrationCatalog } from '@/features/integrations/integration-catalog';
import { t } from '@/i18n';
import { useLocation } from 'react-router';
import { connectionDraft, proxmoxDraft } from '@/features/connections/connection-model';

export function IntegrationsPage() {
  const location = useLocation();
  const state: unknown = location.state;
  const draft =
    state && typeof state === 'object' && 'connectionDraft' in state
      ? connectionDraft(state.connectionDraft)
      : null;
  const proxmoxUrl =
    state && typeof state === 'object' && 'connectionDraft' in state
      ? proxmoxDraft(state.connectionDraft)
      : null;
  return (
    <section aria-label={t('integrations.title')} className="flex flex-col gap-6">
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />
      <Proxmox initialUrl={proxmoxUrl} />
      <Connections initialDraft={draft} />
      <IntegrationCatalog />
    </section>
  );
}
