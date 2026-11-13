import { describe, expect, it } from 'vitest';
import { supportsSource } from '@homora/widgets';
import { systemTelemetryWidget } from '@homora/widgets/system-telemetry';
import { integrationDefinitions } from './integration-manifest.js';
import { integrationTelemetrySource, integrationWidgetDefinition } from './widget-contract.js';
import { createPresentationCatalog } from './frontend-catalog.js';

describe('integration widget registration', () => {
  it('registers every integration with its own source contract and presentation metadata', () => {
    const catalog = createPresentationCatalog((key) => key);
    for (const { type } of integrationDefinitions) {
      const definition = catalog.definition(type);
      expect(definition?.locations).toContain('card');
      expect(definition?.locations).toContain('page');
      expect(definition?.parseConfig({})).toEqual({});
      expect(definition?.parseConfig({ unknown: true })).toBeNull();
      expect(supportsSource(definition!.source, integrationWidgetDefinition(type)!.source)).toBe(
        true,
      );
      expect(catalog.placeholderCount(type)).toBeGreaterThan(0);
    }
    expect(integrationWidgetDefinition('missing')).toBeUndefined();
    expect(
      supportsSource(
        integrationWidgetDefinition('proxmox')!.source,
        integrationWidgetDefinition('coolify')!.source,
      ),
    ).toBe(false);
  });
  it('offers system telemetry only where explicitly declared', () => {
    expect(
      supportsSource(systemTelemetryWidget.source, integrationTelemetrySource('proxmox')),
    ).toBe(true);
    expect(
      supportsSource(systemTelemetryWidget.source, integrationTelemetrySource('coolify')),
    ).toBe(false);
  });
});
