import { defineWidget } from '../../index.js';

export type Config = { type: string; state: string; limit: number };
export const defaultConfig: Config = { type: 'all', state: 'all', limit: 10 };
export const widgetCoolifyResourcesWidget = defineWidget<Config>({
  type: 'coolify-resources',
  version: 1,
  locations: ['page'],
  source: { contract: 'integration:coolify', version: 1 },
  connectionData: 'resources',
  sizes: ['normal', 'wide'],
  defaultConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const c = value as Record<string, unknown>;
    if (
      Object.keys(c).some((k) => !['type', 'state', 'limit'].includes(k)) ||
      typeof c.type !== 'string' ||
      !['all', 'application', 'service'].includes(c.type) ||
      typeof c.state !== 'string' ||
      !['all', 'running', 'degraded', 'stopped', 'unknown'].includes(c.state) ||
      typeof c.limit !== 'number' ||
      !Number.isInteger(c.limit) ||
      c.limit < 1 ||
      c.limit > 50
    )
      return null;
    return { type: c.type, state: c.state, limit: c.limit };
  },
});
