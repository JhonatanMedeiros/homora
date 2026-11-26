import { defineWidget } from '../../index.js';

export type Config = { limit: number };
export const defaultConfig: Config = { limit: 10 };
export const widgetHealthchecksJobsWidget = defineWidget<Config>({
  type: 'healthchecks-jobs',
  version: 1,
  locations: ['page'],
  source: { contract: 'integration:healthchecks', version: 1 },
  sizes: ['normal', 'wide'],
  portable: true,
  defaultConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some((key) => key !== 'limit') ||
      typeof config.limit !== 'number' ||
      !Number.isInteger(config.limit) ||
      config.limit < 1 ||
      config.limit > 50
    )
      return null;
    return { limit: config.limit };
  },
});
