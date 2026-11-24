import { describe, expect, it } from 'vitest';
import { defaultConfig, widgetCoolifyResourcesWidget } from './definition.js';
import { parseResources, selectResources } from './logic.js';

describe('Coolify resource widget', () => {
  it('validates configuration', () => {
    expect(widgetCoolifyResourcesWidget.parseConfig(defaultConfig)).toEqual(defaultConfig);
    expect(widgetCoolifyResourcesWidget.parseConfig({ ...defaultConfig, limit: 0 })).toBeNull();
    expect(widgetCoolifyResourcesWidget.parseConfig({ ...defaultConfig, extra: true })).toBeNull();
  });
  it('filters, orders problems first, and validates links', () => {
    const rows = parseResources({
      resources: [
        {
          uuid: 'a',
          name: 'App',
          type: 'application',
          state: 'running',
          rawStatus: 'running:healthy',
          urls: [
            'https://one.example.test',
            'https://two.example.test',
            'https://user:password@example.test',
          ],
        },
        {
          uuid: 'b',
          name: 'Other',
          type: 'service',
          state: 'unknown',
          rawStatus: 'restarting',
          urls: [],
        },
      ],
    })!;
    expect(rows[0]!.urls).toHaveLength(2);
    expect(selectResources(rows, defaultConfig).rows[0]!.rawStatus).toBe('restarting');
    expect(selectResources(rows, { ...defaultConfig, type: 'service' }).total).toBe(1);
    expect(selectResources(rows, { ...defaultConfig, state: 'stopped' }).rows).toEqual([]);
    expect(parseResources({ resources: [] })).toEqual([]);
  });
});
