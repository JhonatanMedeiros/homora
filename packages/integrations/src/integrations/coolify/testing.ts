import type { IntegrationTransport } from '../../backend.js';
import { createCoolifyAdapter as createAdapter } from './backend.js';
export * from './backend.js';

/** Binds the adapter to a deterministic error factory for contract tests. */
export const createCoolifyAdapter = (transport: IntegrationTransport) =>
  createAdapter(transport, (code) => new Error(code));
