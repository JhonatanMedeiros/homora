import { getWidget } from '@homora/widgets/registry';
import { defineWidget, type WidgetDefinition } from '@homora/widgets';
import { hasSystemTelemetry, integrationDefinition } from './integration-manifest.js';

/** A connection supplies only its own versioned output contract. */
export function integrationWidgetDefinition(
  type: string,
): WidgetDefinition<Record<string, never>> | undefined {
  if (!integrationDefinition(type)) return undefined;
  return defineWidget({
    type,
    version: 1,
    locations: ['card', 'page'],
    source: { contract: `integration:${type}`, version: 1 },
    parseConfig(value) {
      return value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
        ? {}
        : null;
    },
  });
}

/** Only integrations declaring the capability offer the shared telemetry contract. */
export function integrationTelemetrySource(type: string) {
  return hasSystemTelemetry(type) ? { contract: 'system-telemetry', version: 1 } : null;
}

/** Resolve a local or integration widget without requiring the host to know its type. */
export function resolveWidget(type: string): WidgetDefinition<unknown> | undefined {
  return getWidget(type) ?? integrationWidgetDefinition(type);
}
