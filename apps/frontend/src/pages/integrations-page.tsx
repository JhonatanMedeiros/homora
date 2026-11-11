import { PageHeader } from '@/components/page-header';
import { Connections } from '@/features/connections/connections';
import { IntegrationCatalog } from '@/features/integrations/integration-catalog';
import { t } from '@/i18n';
import { useLocation } from 'react-router';
import { connectionDraft } from '@/features/connections/connection-model';

export function IntegrationsPage() {
  const location = useLocation();
  const state: unknown = location.state;
  const draft =
    state && typeof state === 'object' && 'connectionDraft' in state
      ? connectionDraft(state.connectionDraft)
      : null;
  return (
    <section aria-label={t('integrations.title')} className="flex flex-col gap-6">
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />
      <Connections initialDraft={draft} />
      <IntegrationCatalog />
    </section>
  );
}
