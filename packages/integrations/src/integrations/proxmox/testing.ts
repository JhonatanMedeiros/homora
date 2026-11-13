import type { IntegrationTransport } from '../../backend.js';
import { createProxmoxConnectionAdapter as createAdapter } from './backend.js';
import { validateProxmoxConfig } from './validation.js';

/** Binds the host-independent adapter to a deterministic error factory for contract tests. */
export const createProxmoxConnectionAdapter = (transport: IntegrationTransport) =>
  createAdapter(transport, (config) => validateProxmoxConfig(config, (code) => new Error(code)));
