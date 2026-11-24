import { defineWidget } from '../../index.js';

export type Config = { group: string; limit: number };
export const defaultConfig: Config = { group: '', limit: 10 };
export const widgetUptimeKumaMonitorsWidget = defineWidget<Config>({
  type: 'uptime-kuma-monitors',
  version: 1,
  locations: ['page'],
  source: { contract: 'integration:uptime-kuma', version: 1 },
  sizes: ['normal', 'wide'],
  defaultConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => key !== 'group' && key !== 'limit')) return null;
    if (typeof config.group !== 'string' || config.group.length > 256) return null;
    if (
      typeof config.limit !== 'number' ||
      !Number.isInteger(config.limit) ||
      config.limit < 1 ||
      config.limit > 50
    )
      return null;
    return { group: config.group, limit: config.limit };
  },
});
