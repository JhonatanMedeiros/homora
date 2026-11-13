import type { ConnectionData, Credentials } from './integration-connection-config.js';
import type { IntegrationContext, IntegrationTransport } from './integrations.js';
import { getAuthorizedResponse } from './network-request.js';

export function transportFrom(context: IntegrationContext) {
  if (!context.transport) throw new Error('Integration transport unavailable.');
  return context.transport;
}

/** Builds the JSON transport shared by integration reads and Proxmox address lookups. */
export function createIntegrationTransport(
  data: ConnectionData,
  credentials: Credentials,
  invalidJson: 'error' | 'empty' = 'error',
  defaultMaxBodyBytes?: number,
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
        ...((request.maxBodyBytes ?? defaultMaxBodyBytes)
          ? { maxBodyBytes: request.maxBodyBytes ?? defaultMaxBodyBytes }
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
