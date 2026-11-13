import type { ConnectionData, Credentials } from './integration-connection-config.js';
import type { IntegrationTransport } from './integrations.js';
import { getAuthorizedResponse } from './network-request.js';

const PROXMOX_MAX_BODY_BYTES = 2_000_000;

/** Builds the JSON transport shared by integration reads and Proxmox address lookups. */
export function createIntegrationTransport(
  data: ConnectionData,
  credentials: Credentials,
  type: string,
  invalidJson: 'error' | 'empty' = 'error',
): IntegrationTransport {
  return async (request) => {
    const response = await getAuthorizedResponse(
      new URL(request.path, request.origin).href,
      { origins: [new URL(data.url).origin], allowPrivate: data.allowPrivate },
      {
        headers: {
          ...(request.authorization ? { authorization: request.authorization } : {}),
          ...(request.apiKey ? { 'x-api-key': request.apiKey } : {}),
        },
        ca: credentials.ca,
        ...(type === 'proxmox'
          ? { maxBodyBytes: PROXMOX_MAX_BODY_BYTES }
          : request.maxBodyBytes
            ? { maxBodyBytes: request.maxBodyBytes }
            : {}),
      },
    );

    let body: unknown = null;
    if (response.body) {
      try {
        body = JSON.parse(response.body) as unknown;
      } catch {
        if (invalidJson === 'error') throw new Error('Resposta JSON inválida.');
      }
    }
    return {
      status: response.status,
      body,
      ...(response.retryAfterSeconds ? { retryAfterSeconds: response.retryAfterSeconds } : {}),
    };
  };
}
