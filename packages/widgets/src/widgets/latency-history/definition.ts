import {
  availabilityRanges,
  defineWidget,
  monitoringSources,
  type AvailabilityRange,
} from '../../index.js';

export type LatencyHistoryConfig = {
  target: string | null;
  range: AvailabilityRange;
};

export const defaultLatencyHistoryConfig: LatencyHistoryConfig = {
  target: null,
  range: '24h',
};

export const widgetLatencyHistoryWidget = defineWidget<LatencyHistoryConfig>({
  type: 'latency-history',
  version: 1,
  locations: ['page'],
  source: monitoringSources.latency,
  portable: true,
  portableConfig: (config) => ({ ...config, target: null }),
  sizes: ['normal', 'wide'],
  defaultConfig: defaultLatencyHistoryConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !['target', 'range'].includes(key))) return null;
    if (
      config.target !== null &&
      (typeof config.target !== 'string' || !/^[0-9a-f]{32}$/.test(config.target))
    )
      return null;
    if (
      typeof config.range !== 'string' ||
      !availabilityRanges.includes(config.range as AvailabilityRange)
    )
      return null;
    return { target: config.target as string | null, range: config.range as AvailabilityRange };
  },
});
