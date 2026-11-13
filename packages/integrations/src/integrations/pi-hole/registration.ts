import {
  defineBackendIntegration,
  transportFrom,
  type IntegrationContext,
  type InputErrorFactory,
} from '../../backend.js';
import { piHoleDefinition } from './definition.js';
import { createPiHoleAdapter } from './backend.js';

export function createPiHoleRegistration(inputError: InputErrorFactory) {
  return defineBackendIntegration(piHoleDefinition, {
    sessionAuth: {
      loginPath: '/api/auth',
      body: { password: { source: 'secret' } },
      tokenPath: ['session', 'sid'],
      validPath: ['session', 'valid'],
      validityPath: ['session', 'validity'],
      tokenFormat: 'base64',
      sendAs: { type: 'header', name: 'x-ftl-sid' },
      refreshOnSuccess: true,
    },
    retryDelaySeconds: () => 60,
    prepare(context: IntegrationContext) {
      const adapter = createPiHoleAdapter(transportFrom(context), inputError);
      const config = adapter.validate({
        url: String(context.publicConfig.url ?? ''),
        secret: context.credentials.secret ?? '',
      });
      return () => adapter.collect(config);
    },
  });
}
