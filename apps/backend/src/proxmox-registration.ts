import { isNodeName, proxmoxDefinition } from '@homora/shared';
import { defineBackendIntegration } from '@homora/integrations/backend';
import { InputError } from './api-error.js';
import type { IntegrationContext } from './integrations.js';
import { createProxmoxConnectionAdapter } from './proxmox-connection.js';
import type { ProxmoxGuest } from './proxmox-inventory.js';
import { transportFrom } from './integration-transport.js';

const proxmoxConfig = (context: IntegrationContext) => ({
  url: String(context.publicConfig.url ?? ''),
  tokenId: context.credentials.tokenId ?? '',
  secret: context.credentials.secret ?? '',
  ca: context.credentials.ca,
});

/** Proxmox stays code: several requests, CA pinning and a large payload do not fit a manifest. */
export const proxmoxRegistration = defineBackendIntegration(proxmoxDefinition, {
  prepare(context: IntegrationContext) {
    const adapter = createProxmoxConnectionAdapter(transportFrom(context));
    const config = adapter.validate(proxmoxConfig(context));
    // Optional scope: one node instead of the whole cluster. Empty or absent keeps the cluster totals.
    const node = context.publicConfig.node;
    if (node === undefined || node === '') return () => adapter.collect(config);
    if (!isNodeName(node)) throw new InputError('invalid-config');
    return () => adapter.collectNode(config, node);
  },
  prepareAddresses(context: IntegrationContext) {
    const adapter = createProxmoxConnectionAdapter(transportFrom(context));
    const config = adapter.validate(proxmoxConfig(context));
    return (guests: readonly unknown[]) => adapter.addresses(config, guests as ProxmoxGuest[]);
  },
  prepareInventory(context: IntegrationContext) {
    const adapter = createProxmoxConnectionAdapter(transportFrom(context));
    const config = adapter.validate(proxmoxConfig(context));
    return () => adapter.inventory(config);
  },
});
