import { PageHeader } from '@/components/page-header';
import { Proxmox } from '@/features/proxmox/proxmox';
import { Connections } from '@/features/connections/connections';
import { IntegrationCatalog } from '@/features/integrations/integration-catalog';

export function IntegrationsPage() {
  return (
    <section aria-label="Integrações" className="flex flex-col gap-6">
      <PageHeader
        title="Integrações"
        description="Conecte o Proxmox e outros serviços para ver o estado do seu homelab aqui."
      />
      <Proxmox />
      <Connections />
      <IntegrationCatalog />
    </section>
  );
}
