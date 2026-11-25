import { expect, it, vi } from 'vitest';
import { createHomeAssistantRegistration } from './registration.js';
import type { IntegrationTransport } from '../../backend.js';

it('queries only the requested entity states with bounded concurrency and safe projection', async () => {
  let active = 0;
  let maximumActive = 0;
  const transport: IntegrationTransport = vi.fn(async ({ path, authorization, maxBodyBytes }) => {
    expect(authorization).toBe('Bearer synthetic-token');
    expect(maxBodyBytes).toBe(32 * 1024);
    active++;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active--;
    if (path.endsWith('/light.room')) return { status: 404, body: null };
    if (path.endsWith('/switch.broken')) return { status: 503, body: null };
    return {
      status: 200,
      body: {
        entity_id: path.endsWith('/sensor.temperature') ? 'sensor.temperature' : 'sensor.other',
        state: '21.5',
        last_updated: '2026-01-01T10:00:00+00:00',
        attributes: { latitude: 0 },
      },
    };
  });
  const registration = createHomeAssistantRegistration((code) => new Error(code));
  const query = registration.prepareWidgetQuery!({
    publicConfig: { url: 'https://ha.example.test', entityId: 'sensor.temperature' },
    credentials: { secret: 'synthetic-token' },
    transport,
  });

  const result = await query('entity-states', {
    entityIds: ['sensor.temperature', 'light.room', 'switch.broken', 'sensor.mismatch'],
  });

  expect(result).toEqual({
    entities: [
      {
        entityId: 'sensor.temperature',
        status: 'ready',
        state: '21.5',
        lastUpdated: '2026-01-01T10:00:00+00:00',
      },
      { entityId: 'light.room', status: 'not-found' },
      { entityId: 'switch.broken', status: 'unavailable' },
      { entityId: 'sensor.mismatch', status: 'unavailable' },
    ],
    fetchedAt: expect.any(Number),
    stale: false,
  });
  expect(maximumActive).toBeLessThanOrEqual(2);
  expect(transport).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(result)).not.toContain('latitude');
  expect(JSON.stringify(result)).not.toContain('synthetic-token');
});

it('rejects unknown operations and invalid or oversized entity lists before transport', async () => {
  const transport: IntegrationTransport = vi.fn(async () => ({ status: 200, body: {} }));
  const registration = createHomeAssistantRegistration((code) => new Error(code));
  const query = registration.prepareWidgetQuery!({
    publicConfig: { url: 'https://ha.example.test', entityId: 'sensor.temperature' },
    credentials: { secret: 'synthetic-token' },
    transport,
  });

  await expect(query('all-states', { entityIds: ['sensor.a'] })).rejects.toThrow(
    'Invalid Home Assistant widget query.',
  );
  await expect(query('entity-states', { entityIds: ['sensor.a', '../secrets'] })).rejects.toThrow(
    'Invalid Home Assistant widget query.',
  );
  await expect(
    query('entity-states', {
      entityIds: Array.from({ length: 9 }, (_, index) => `sensor.entity_${index}`),
    }),
  ).rejects.toThrow('Invalid Home Assistant widget query.');
  expect(transport).not.toHaveBeenCalled();
});
