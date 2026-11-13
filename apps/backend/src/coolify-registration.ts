import { coolifyDefinition } from '@homora/shared';
import { defineBackendIntegration } from '@homora/integrations/backend';
import type { IntegrationContext } from './integrations.js';
import { CoolifyBackoffError, createCoolifyAdapter } from './coolify-connection.js';
import { transportFrom } from './integration-transport.js';

/** Coolify stays code: several reads, a composite status and a link workflow (see ADR 0010). */
const coolifyConfig = (context: IntegrationContext) => ({
  url: String(context.publicConfig.url ?? ''),
  secret: context.credentials.secret ?? '',
});
export const coolifyRegistration = defineBackendIntegration(coolifyDefinition, {
  retryDelaySeconds: (error) =>
    error instanceof CoolifyBackoffError ? (error.retryAfterSeconds ?? 0) : null,
  prepare(context: IntegrationContext) {
    const adapter = createCoolifyAdapter(transportFrom(context));
    const config = adapter.validate(coolifyConfig(context));
    return () => adapter.collect(config);
  },
  prepareInventory(context: IntegrationContext) {
    const adapter = createCoolifyAdapter(transportFrom(context));
    const config = adapter.validate(coolifyConfig(context));
    return () => adapter.inventory(config);
  },
});
