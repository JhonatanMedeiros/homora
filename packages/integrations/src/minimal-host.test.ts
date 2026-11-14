import { expect, it, vi } from 'vitest';
import { defineWidget, supportsSource } from '@homora/widgets';
import { defineBackendIntegration } from '@homora/integrations/backend';
import { renderManifestDisplay } from '@homora/integrations/frontend';
import type { IntegrationManifest } from '@homora/integrations';

it('registers a synthetic integration and presents its widget in a minimal host', async () => {
  const definition: IntegrationManifest = {
    kind: 'manifest',
    type: 'sample-sensors',
    label: 'Sensors',
    mark: 'SS',
    capabilities: ['reading'],
    fields: [{ key: 'url', kind: 'url', label: 'URL', required: true, maxLength: 2048 }],
    auth: { type: 'none' },
    requests: [{ id: 'reading', path: '/reading' }],
    extract: [{ op: 'pick', out: 'count', path: ['count'], type: 'integer', min: 0, max: 100 }],
    display: {
      summary: { text: '{count} sensors' },
      stats: [{ label: 'Sensors', value: '{count}' }],
    },
  };
  const collect = vi.fn(async () => ({ count: 3 }));
  const integration = defineBackendIntegration(definition, { prepare: () => collect });
  const registry = new Map([[integration.type, integration]]);
  const widget = defineWidget({
    type: integration.type,
    version: 1,
    locations: ['card'],
    source: { contract: `integration:${integration.type}`, version: 1 },
    parseConfig: (value: unknown) =>
      value && typeof value === 'object' && Object.keys(value).length === 0 ? {} : null,
  });
  const source = { contract: `integration:${integration.type}`, version: 1 };
  expect(supportsSource(widget.source, source)).toBe(true);
  expect(supportsSource(widget.source, { ...source, version: 2 })).toBe(false);
  expect(widget.parseConfig({})).toEqual({});
  const data = await registry.get(widget.type)!.prepare!({ publicConfig: {}, credentials: {} })();
  const render = (input: unknown) =>
    renderManifestDisplay(definition.display, input, (_key, fallback, params) =>
      fallback.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? ''),
    );
  expect(render(data)).toEqual({ summary: '3 sensors', stats: [{ label: 'Sensors', value: '3' }] });
  expect(render({ count: {} })).toBeNull();
  expect(render(null)).toBeNull();
  expect(collect).toHaveBeenCalledOnce();
});
