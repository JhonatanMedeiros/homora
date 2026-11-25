import { defineWidget } from '../../index.js';

export const MAX_ENTITIES = 8;
export const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export type Config = { entities: string[] };
export const defaultConfig: Config = { entities: [] };

export function parseEntityId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 255) return null;
  return ENTITY_ID_PATTERN.test(value) ? value : null;
}

export const widgetHomeAssistantEntitiesWidget = defineWidget<Config>({
  type: 'home-assistant-entities',
  version: 1,
  locations: ['page'],
  source: { contract: 'integration:home-assistant', version: 1 },
  defaultConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => key !== 'entities') || !Array.isArray(config.entities))
      return null;
    if (config.entities.length === 0 || config.entities.length > MAX_ENTITIES) return null;
    const entities: string[] = [];
    for (const raw of config.entities) {
      const entity = parseEntityId(raw);
      if (!entity || entities.includes(entity)) return null;
      entities.push(entity);
    }
    return { entities };
  },
});
