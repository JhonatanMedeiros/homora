import { describe, expect, it, vi } from 'vitest';
import { homeAssistantEntitiesSource } from './source.js';

describe('Home Assistant entities source', () => {
  it('validates connection-scoped queries and bounds the entity list', () => {
    const parse = (query: Record<string, string>) => homeAssistantEntitiesSource.parseQuery(query);
    expect(parse({ connectionId: '4', entities: 'sensor.temperature,light.living_room' })).toEqual({
      cacheKey: '4\0sensor.temperature\0light.living_room',
      cacheTags: ['integration:4'],
      params: {
        connectionId: 4,
        entityIds: ['sensor.temperature', 'light.living_room'],
      },
    });
    expect(parse({ connectionId: '0', entities: 'sensor.a' })).toBeNull();
    expect(parse({ connectionId: '1', entities: 'sensor.a,sensor.a' })).toBeNull();
    expect(parse({ connectionId: '1', entities: '../secrets' })).toBeNull();
    expect(parse({ connectionId: '1', entities: 'sensor.a', extra: 'all' })).toBeNull();
    expect(
      parse({
        connectionId: '1',
        entities: Array.from({ length: 9 }, (_, index) => `sensor.${index}`).join(','),
      }),
    ).toBeNull();
  });

  it('uses the authorized integration query and projects only state fields', async () => {
    const readIntegration = vi.fn(async () => ({
      entities: [
        {
          entityId: 'sensor.temperature',
          status: 'ready',
          state: '21.5',
          lastUpdated: '2026-01-01T10:00:00+00:00',
          attributes: { latitude: 0 },
        },
      ],
      fetchedAt: 123,
      stale: false,
      secret: 'must not escape',
    }));
    const parsed = homeAssistantEntitiesSource.parseQuery({
      connectionId: '7',
      entities: 'sensor.temperature',
    })!;
    const result = await homeAssistantEntitiesSource.read(parsed.params, {
      fetch: vi.fn(),
      now: () => 123,
      readIntegration,
    });
    expect(readIntegration).toHaveBeenCalledWith(7, 'entity-states', {
      entityIds: ['sensor.temperature'],
    });
    expect(result).toEqual({
      entities: [
        {
          entityId: 'sensor.temperature',
          status: 'ready',
          state: '21.5',
          lastUpdated: '2026-01-01T10:00:00+00:00',
        },
      ],
      fetchedAt: 123,
      stale: false,
    });
  });

  it('rejects malformed integration output', async () => {
    const parsed = homeAssistantEntitiesSource.parseQuery({
      connectionId: '7',
      entities: 'sensor.temperature',
    })!;
    await expect(
      homeAssistantEntitiesSource.read(parsed.params, {
        fetch: vi.fn(),
        now: () => 123,
        readIntegration: vi.fn(async () => ({ entities: [], fetchedAt: 123, stale: false })),
      }),
    ).rejects.toThrow('Could not parse source response.');
  });
});
