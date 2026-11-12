import type { IntegrationAdapter, IntegrationTransport } from './integrations.js';
import { validateProxmoxConfig, type ProxmoxConfig } from './vault.js';
import { summarizeProxmox, type ProxmoxSummary } from './proxmox-summary.js';
import {
  agentAddresses,
  configAddresses,
  inventoryProxmox,
  type GuestAddresses,
  type ProxmoxGuest,
  type ProxmoxInventory,
} from './proxmox-inventory.js';

const MAX_GUESTS = 200;
const CONCURRENCY = 4;

/** Uses the shared transport so destination and TLS policy apply to each connection. */
export function createProxmoxConnectionAdapter(transport: IntegrationTransport): IntegrationAdapter<
  ProxmoxConfig,
  ProxmoxSummary
> & {
  inventory(config: ProxmoxConfig): Promise<ProxmoxInventory>;
  addresses(config: ProxmoxConfig, guests: ProxmoxGuest[]): Promise<GuestAddresses[]>;
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
    /**
     * Read-only GETs of each guest's configuration (and, for running VMs, the guest agent). Only
     * what the token is allowed to read is used: a refused or failing call simply yields no
     * address for that source. Never throws for a single guest.
     */
    async addresses(config, guests) {
      const safe = validateProxmoxConfig(config);
      const authorization = `PVEAPIToken=${safe.tokenId}=${safe.secret}`;
      const read = async (path: string) => {
        try {
          const response = await transport({ origin: safe.url, path, authorization });
          const body = response.body as { data?: unknown } | null;
          return response.status === 200 && body ? body.data : null;
        } catch {
          return null;
        }
      };
      const queue = guests.slice(0, MAX_GUESTS);
      const results: GuestAddresses[] = [];
      const worker = async () => {
        for (let guest = queue.shift(); guest; guest = queue.shift()) {
          const base = `/api2/json/nodes/${guest.node}/${guest.type}/${guest.vmid}`;
          const configData = await read(`${base}/config`);
          const agentData =
            guest.type === 'qemu' && guest.status === 'running'
              ? await read(`${base}/agent/network-get-interfaces`)
              : null;
          results.push({
            node: guest.node,
            vmid: guest.vmid,
            type: guest.type,
            config: configAddresses(guest.type, configData),
            agent: agentAddresses(agentData),
          });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      return results;
    },
  };
}
