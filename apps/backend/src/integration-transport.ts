import type { IntegrationContext } from './integrations.js';

export function transportFrom(context: IntegrationContext) {
  if (!context.transport) throw new Error('Integration transport unavailable.');
  return context.transport;
}
