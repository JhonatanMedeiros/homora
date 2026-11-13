import { createCoolifyAdapter as createAdapter } from '@homora/integrations/coolify/backend';
import type { IntegrationTransport } from '@homora/integrations/backend';
import { InputError } from './api-error.js';

export * from '@homora/integrations/coolify/backend';

/** Bind the host API error type without exposing it to the integration package. */
export const createCoolifyAdapter = (transport: IntegrationTransport) =>
  createAdapter(transport, (code) => new InputError(code));
