import { createManifestRegistration } from '../../backend-manifest-adapter.js';
import type { ManifestHost } from '../../backend-manifest-adapter.js';
import {
  transportFrom,
  type IntegrationWidgetQuery,
  type InputErrorFactory,
  type IntegrationContext,
} from '../../backend.js';
import { homeAssistantManifest } from './definition.js';

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const MAX_ENTITIES = 8;
const MAX_STATE_LENGTH = 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_CONCURRENT_REQUESTS = 2;

type EntityResult =
  | { entityId: string; status: 'ready'; state: string; lastUpdated: string | null }
  | { entityId: string; status: 'not-found' | 'unavailable' };

function isEntityList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_ENTITIES &&
    value.every((id) => typeof id === 'string' && id.length <= 255 && ENTITY_ID.test(id)) &&
    new Set(value).size === value.length
  );
}

function readEntity(body: unknown, entityId: string): EntityResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { entityId, status: 'unavailable' };
  }
  const value = body as Record<string, unknown>;
  if (
    value.entity_id !== entityId ||
    typeof value.state !== 'string' ||
    value.state.length > MAX_STATE_LENGTH
  ) {
    return { entityId, status: 'unavailable' };
  }
  const lastUpdated =
    typeof value.last_updated === 'string' && value.last_updated.length <= 128
      ? value.last_updated
      : null;
  return { entityId, status: 'ready', state: value.state, lastUpdated };
}

function createManifestHost(inputError: InputErrorFactory): ManifestHost {
  return {
    isBrandIcon: (name) => name === homeAssistantManifest.brandIcon,
    isErrorCode: (code) =>
      code === 'https-url-required' || code === 'invalid-entity' || code === 'invalid-token',
    inputError,
  };
}

export function createHomeAssistantRegistration(inputError: InputErrorFactory) {
  const base = createManifestRegistration(homeAssistantManifest, createManifestHost(inputError));
  return {
    ...base,
    prepareWidgetQuery(context: IntegrationContext): IntegrationWidgetQuery {
      if (!base.prepare) throw new Error('Home Assistant integration is unavailable.');
      base.prepare(context);
      const transport = transportFrom(context);
      const origin = String(context.publicConfig.url ?? '');
      const secret = context.credentials.secret ?? '';
      return async (operation: string, params: unknown) => {
        if (
          operation !== 'entity-states' ||
          !params ||
          typeof params !== 'object' ||
          Array.isArray(params) ||
          !isEntityList((params as Record<string, unknown>).entityIds)
        )
          throw new Error('Invalid Home Assistant widget query.');

        const entityIds = (params as { entityIds: string[] }).entityIds;
        const results: EntityResult[] = [];
        let next = 0;
        const readNext = async () => {
          while (next < entityIds.length) {
            const index = next++;
            const entityId = entityIds[index]!;
            try {
              const response = await transport({
                origin,
                path: `/api/states/${encodeURIComponent(entityId)}`,
                authorization: `Bearer ${secret}`,
                maxBodyBytes: MAX_RESPONSE_BYTES,
              });
              results[index] =
                response.status === 404
                  ? { entityId, status: 'not-found' }
                  : response.status >= 200 && response.status < 300
                    ? readEntity(response.body, entityId)
                    : { entityId, status: 'unavailable' };
            } catch {
              results[index] = { entityId, status: 'unavailable' };
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, entityIds.length) }, () =>
            readNext(),
          ),
        );
        return { entities: results, fetchedAt: Date.now(), stale: false };
      };
    },
  };
}
