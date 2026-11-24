import {
  defineBackendIntegration,
  transportFrom,
  type IntegrationContext,
  type InputErrorFactory,
} from '../../backend.js';
import { omadaDefinition } from './definition.js';
import { OmadaError, createOmadaAdapter } from './backend.js';

export function createOmadaRegistration(inputError: InputErrorFactory) {
  return defineBackendIntegration(omadaDefinition, {
    /**
     * OAuth client-credentials exchange (Omada Open API). The wire values are fixed here: the
     * host validates them and the user cannot change the path, query, body keys or header format.
     * The refresh token in the response is never read. Errors on reads are not treated as
     * expiry: the same code was observed for a wrongly formatted header.
     */
    sessionAuth: {
      loginPath: '/openapi/authorize/token',
      loginQuery: { grant_type: 'client_credentials' },
      body: {
        omadacId: { source: 'config', key: 'omadacId' },
        client_id: { source: 'tokenId' },
        client_secret: { source: 'secret' },
      },
      successCode: { path: ['errorCode'], value: 0 },
      tokenPath: ['result', 'accessToken'],
      validityPath: ['result', 'expiresIn'],
      tokenFormat: 'printable',
      sendAs: { type: 'authorization', scheme: 'access-token' },
      refreshOnSuccess: false,
    },
    retryDelaySeconds(error) {
      if (!(error instanceof OmadaError)) return null;
      if (error.kind === 'auth') return 60;
      return error.kind === 'rate-limited' ? (error.retryAfterSeconds ?? 60) : null;
    },
    prepare(context: IntegrationContext) {
      const adapter = createOmadaAdapter(transportFrom(context), inputError);
      const config = adapter.validate({
        url: String(context.publicConfig.url ?? ''),
        omadacId: String(context.publicConfig.omadacId ?? ''),
        siteId: String(context.publicConfig.siteId ?? ''),
        tokenId: context.credentials.tokenId ?? '',
        secret: context.credentials.secret ?? '',
      });
      return () => adapter.collect(config);
    },
  });
}
