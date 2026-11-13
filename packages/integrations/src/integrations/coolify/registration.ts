import { coolifyDefinition } from './definition.js';
import {
  defineBackendIntegration,
  transportFrom,
  type IntegrationContext,
  type IntegrationTransport,
  type InputErrorFactory,
} from '../../backend.js';
import { CoolifyBackoffError, createCoolifyAdapter } from './backend.js';

const coolifyConfig = (context: IntegrationContext) => ({
  url: String(context.publicConfig.url ?? ''),
  secret: context.credentials.secret ?? '',
});
export function createCoolifyRegistration(inputError: InputErrorFactory) {
  const create = (transport: IntegrationTransport) => createCoolifyAdapter(transport, inputError);
  return defineBackendIntegration(coolifyDefinition, {
    retryDelaySeconds: (error) =>
      error instanceof CoolifyBackoffError ? (error.retryAfterSeconds ?? 0) : null,
    prepare(context: IntegrationContext) {
      const adapter = create(transportFrom(context));
      const config = adapter.validate(coolifyConfig(context));
      return () => adapter.collect(config);
    },
    prepareInventory(context: IntegrationContext) {
      const adapter = create(transportFrom(context));
      const config = adapter.validate(coolifyConfig(context));
      return () => adapter.inventory(config);
    },
  });
}
