import { integrationDefinitions, isNodeName, proxmoxDefinition } from '@homora/shared';
import { InputError } from './api-error.js';
import { createIntegrationRegistry, type IntegrationContext } from './integrations.js';
import { assertValidDefinition } from './integration-manifest.js';
import { createManifestRegistration } from './manifest-adapter.js';
import { createProxmoxConnectionAdapter } from './proxmox-connection.js';
import type { ProxmoxGuest } from './proxmox-inventory.js';

function transportFrom(context: IntegrationContext) {
  if (!context.transport) throw new Error('Integration transport unavailable.');
  return context.transport;
}

const proxmoxConfig = (context: IntegrationContext) => ({
  url: String(context.publicConfig.url ?? ''),
  tokenId: context.credentials.tokenId ?? '',
  secret: context.credentials.secret ?? '',
  ca: context.credentials.ca,
});

/** Proxmox stays code: several requests, CA pinning and a large payload do not fit a manifest. */
assertValidDefinition(proxmoxDefinition);
const proxmoxRegistration = {
  type: proxmoxDefinition.type,
  label: proxmoxDefinition.label,
  capabilities: proxmoxDefinition.capabilities,
  definition: proxmoxDefinition,
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
};

/** One definition per integration; manifests are interpreted, code adapters are registered by hand. */
export const integrationRegistry = createIntegrationRegistry(
  integrationDefinitions.map((definition) =>
    definition.kind === 'manifest'
      ? createManifestRegistration(definition)
      : (
          {
            proxmox: proxmoxRegistration,
          } as Record<string, typeof proxmoxRegistration>
        )[definition.type]!,
  ),
);
