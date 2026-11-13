import { createProxmoxConnectionAdapter as createAdapter } from '@homora/integrations/proxmox/backend';
import type { IntegrationTransport } from '@homora/integrations/backend';
import { validateProxmoxConfig } from './vault.js';

export type { NodeUnavailable } from '@homora/integrations/proxmox/backend';
export const createProxmoxConnectionAdapter = (transport: IntegrationTransport) =>
  createAdapter(transport, validateProxmoxConfig);
