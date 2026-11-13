import { isNodeName, type ProxmoxConfig } from './contracts.js';
import { proxmoxDefinition } from './definition.js';
import {
  defineBackendIntegration,
  transportFrom,
  type IntegrationContext,
  type IntegrationTransport,
  type InputErrorFactory,
} from '../../backend.js';
import { createProxmoxConnectionAdapter } from './backend.js';
import { validateProxmoxConfig } from './validation.js';
import type { ProxmoxGuest } from './inventory.js';

const proxmoxConfig = (context: IntegrationContext) => ({
  url: String(context.publicConfig.url ?? ''),
  tokenId: context.credentials.tokenId ?? '',
  secret: context.credentials.secret ?? '',
  ca: context.credentials.ca,
});

/** Proxmox stays code: several requests, CA pinning and a large payload do not fit a manifest. */
export function createProxmoxRegistration(inputError: InputErrorFactory) {
  const validate = (config: ProxmoxConfig) => validateProxmoxConfig(config, inputError);
  const create = (transport: IntegrationTransport) =>
    createProxmoxConnectionAdapter(transport, validate);
  return defineBackendIntegration(proxmoxDefinition, {
    prepare(context: IntegrationContext) {
      const adapter = create(transportFrom(context));
      const config = adapter.validate(proxmoxConfig(context));
      // Optional scope: one node instead of the whole cluster. Empty or absent keeps the cluster totals.
      const node = context.publicConfig.node;
      if (node === undefined || node === '') return () => adapter.collect(config);
      if (!isNodeName(node)) throw inputError('invalid-config');
      return () => adapter.collectNode(config, node);
    },
    prepareAddresses(context: IntegrationContext) {
      const adapter = create(transportFrom(context));
      const config = adapter.validate(proxmoxConfig(context));
      return (guests: readonly unknown[]) => adapter.addresses(config, guests as ProxmoxGuest[]);
    },
    prepareInventory(context: IntegrationContext) {
      const adapter = create(transportFrom(context));
      const config = adapter.validate(proxmoxConfig(context));
      return () => adapter.inventory(config);
    },
  });
}
