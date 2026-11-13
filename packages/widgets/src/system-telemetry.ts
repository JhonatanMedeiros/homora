import { defineWidget } from './index.js';

/** The host supplies percentages for CPU, memory and disk from a capable source. */
export const systemTelemetryWidget = defineWidget({
  type: 'system-telemetry',
  version: 1,
  locations: ['top-bar'],
  source: { contract: 'system-telemetry', version: 1 },
  parseConfig(value: unknown) {
    return value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
      ? {}
      : null;
  },
});
