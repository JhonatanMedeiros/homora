import type { IntegrationAdapter, IntegrationTransport } from './integrations.js';
import { validateProxmoxConfig, type ProxmoxConfig } from './vault.js';
import { summarizeProxmox, type ProxmoxSummary } from './proxmox-summary.js';
import { inventoryProxmox, type ProxmoxInventory } from './proxmox-inventory.js';

/** Uses the shared transport so destination and TLS policy apply to each connection. */
export function createProxmoxConnectionAdapter(transport: IntegrationTransport): IntegrationAdapter<
  ProxmoxConfig,
  ProxmoxSummary
> & {
  inventory(config: ProxmoxConfig): Promise<ProxmoxInventory>;
} {
  async function resources(config: ProxmoxConfig) {
    const safe = validateProxmoxConfig(config);
    const response = await transport({
      origin: safe.url,
      path: '/api2/json/cluster/resources',
      authorization: `PVEAPIToken=${safe.tokenId}=${safe.secret}`,
    });
    if (
      response.status !== 200 ||
      !response.body ||
      typeof response.body !== 'object' ||
      !Array.isArray((response.body as { data?: unknown }).data)
    )
      throw new Error('Invalid Proxmox response.');
    return (response.body as { data: unknown[] }).data;
  }
  return {
    type: 'proxmox',
    label: 'Proxmox VE',
    capabilities: ['inventory'],
    validate: validateProxmoxConfig,
    async collect(config) {
      return summarizeProxmox(await resources(config));
    },
    async inventory(config) {
      return inventoryProxmox(await resources(config));
    },
  };
}
