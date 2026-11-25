import { describe, expect, it } from 'vitest';
import { MAX_ENTITIES, parseEntityId, widgetHomeAssistantEntitiesWidget } from './definition.js';

describe('Home Assistant entities widget', () => {
  it('accepts a bounded list of valid entity IDs', () => {
    const config = { entities: ['sensor.temperature', 'light.living_room'] };
    expect(widgetHomeAssistantEntitiesWidget.parseConfig(config)).toEqual(config);
    expect(
      widgetHomeAssistantEntitiesWidget.parseConfig({
        entities: Array.from({ length: MAX_ENTITIES }, (_, index) => `sensor.entity_${index}`),
      }),
    ).not.toBeNull();
  });

  it('rejects malformed, duplicate, extra, and oversized configuration', () => {
    expect(parseEntityId('sensor.temperature')).toBe('sensor.temperature');
    for (const entity of [
      '',
      'sensor.',
      '.temperature',
      'sensor.room/light',
      'sensor.a'.repeat(40),
    ])
      expect(parseEntityId(entity)).toBeNull();
    expect(widgetHomeAssistantEntitiesWidget.parseConfig({ entities: [] })).toBeNull();
    expect(
      widgetHomeAssistantEntitiesWidget.parseConfig({ entities: ['sensor.a', 'sensor.a'] }),
    ).toBeNull();
    expect(
      widgetHomeAssistantEntitiesWidget.parseConfig({
        entities: Array.from({ length: MAX_ENTITIES + 1 }, (_, index) => `sensor.entity_${index}`),
      }),
    ).toBeNull();
    expect(widgetHomeAssistantEntitiesWidget.parseConfig(null)).toBeNull();
    expect(
      widgetHomeAssistantEntitiesWidget.parseConfig({ entities: ['sensor.a'], extra: true }),
    ).toBeNull();
  });
});
