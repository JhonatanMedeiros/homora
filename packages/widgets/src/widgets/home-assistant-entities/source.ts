import { SourceParseError, type WidgetSourceReader } from '../../source.js';
import { MAX_ENTITIES, parseEntityId } from './definition.js';

export type HomeAssistantEntity = {
  entityId: string;
  status: 'ready' | 'not-found' | 'unavailable';
  state?: string;
  lastUpdated?: string | null;
};

export type HomeAssistantEntitiesResult = {
  entities: HomeAssistantEntity[];
  fetchedAt: number;
  stale: boolean;
};

type Params = { connectionId: number; entityIds: string[] };

function parseResult(value: unknown, params: Params): HomeAssistantEntitiesResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    !Array.isArray(result.entities) ||
    result.entities.length !== params.entityIds.length ||
    typeof result.fetchedAt !== 'number' ||
    !Number.isFinite(result.fetchedAt) ||
    typeof result.stale !== 'boolean'
  )
    return null;
  const entities: HomeAssistantEntity[] = [];
  for (const [index, item] of result.entities.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const entity = item as Record<string, unknown>;
    if (entity.entityId !== params.entityIds[index]) return null;
    if (entity.status === 'not-found' || entity.status === 'unavailable') {
      entities.push({ entityId: params.entityIds[index]!, status: entity.status });
      continue;
    }
    if (
      entity.status !== 'ready' ||
      typeof entity.state !== 'string' ||
      entity.state.length > 1024 ||
      (entity.lastUpdated !== null &&
        typeof entity.lastUpdated !== 'string' &&
        entity.lastUpdated !== undefined) ||
      (typeof entity.lastUpdated === 'string' && entity.lastUpdated.length > 128)
    )
      return null;
    entities.push({
      entityId: params.entityIds[index]!,
      status: 'ready',
      state: entity.state,
      lastUpdated: typeof entity.lastUpdated === 'string' ? entity.lastUpdated : null,
    });
  }
  return {
    entities,
    fetchedAt: result.fetchedAt as number,
    stale: result.stale as boolean,
  };
}

export const homeAssistantEntitiesSource: WidgetSourceReader<Params, HomeAssistantEntitiesResult> =
  {
    contract: 'home-assistant-entities',
    cacheTtlMs: 15_000,
    maxCacheEntries: 64,
    parseQuery(query) {
      if (
        Object.keys(query).some((key) => key !== 'connectionId' && key !== 'entities') ||
        !/^[1-9]\d*$/.test(query.connectionId ?? '')
      )
        return null;
      const connectionId = Number(query.connectionId);
      if (!Number.isSafeInteger(connectionId)) return null;
      const entityIds = (query.entities ?? '').split(',');
      if (
        entityIds.length === 0 ||
        entityIds.length > MAX_ENTITIES ||
        entityIds.some((id) => !parseEntityId(id)) ||
        new Set(entityIds).size !== entityIds.length
      )
        return null;
      return {
        cacheKey: `${connectionId}\0${entityIds.join('\0')}`,
        params: { connectionId, entityIds },
      };
    },
    async read(params, context) {
      if (!context.readIntegration) throw new Error('Integration query host unavailable.');
      const result = await context.readIntegration(params.connectionId, 'entity-states', {
        entityIds: params.entityIds,
      });
      const parsed = parseResult(result, params);
      if (!parsed) throw new SourceParseError();
      return { ...parsed, stale: false };
    },
  };
