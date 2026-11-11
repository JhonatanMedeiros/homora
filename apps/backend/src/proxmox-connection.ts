import type { IntegrationAdapter, IntegrationTransport } from './integrations.js';
import { validateProxmoxConfig, type ProxmoxConfig } from './vault.js';
import { summarizeProxmox, type ProxmoxSummary } from './proxmox-summary.js';

/** Uses the shared transport so destination and TLS policy apply to each connection. */
export function createProxmoxConnectionAdapter(
  transport: IntegrationTransport,
): IntegrationAdapter<ProxmoxConfig, ProxmoxSummary> {
  return {
    type: 'proxmox',
    label: 'Proxmox VE',
    capabilities: ['inventory'],
    validate: validateProxmoxConfig,
    async collect(config) {
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
      return summarizeProxmox((response.body as { data: unknown[] }).data);
    },
  };
}
