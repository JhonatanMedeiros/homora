import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '@homora/db';
import { afterEach, expect, it, vi } from 'vitest';
import { createIntegrationConnections } from './integrations/integration-connections.js';
import { createVault } from './vault.js';
import { getAuthorizedResponse } from './network-request.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it('uses the saved connection and restricted GET transport for selected entity states', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-ha-widget-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  const secret = 'synthetic-home-assistant-token';
  try {
    const connections = createIntegrationConnections(database.db, createVault(path));
    const connection = await connections.createConnection({
      type: 'home-assistant',
      name: 'Home Assistant',
      url: 'https://ha.example.test',
      entityId: 'sensor.temperature',
      secret,
      allowPrivate: true,
    });
    vi.mocked(getAuthorizedResponse).mockImplementation(async (url, policy, options) => {
      expect(policy).toEqual({ origins: ['https://ha.example.test'], allowPrivate: true });
      expect(options?.headers).toEqual({ authorization: `Bearer ${secret}` });
      if (url.endsWith('/api/states/light.room')) return { status: 404, body: '' };
      return {
        status: 200,
        body: JSON.stringify({
          entity_id: 'sensor.temperature',
          state: '21.5',
          last_updated: '2026-01-01T10:00:00+00:00',
          attributes: { latitude: 0 },
        }),
      };
    });

    const result = await connections.widgetQuery(connection.id, 'entity-states', {
      entityIds: ['sensor.temperature', 'light.room'],
    });

    expect(result).toMatchObject({
      entities: [
        {
          entityId: 'sensor.temperature',
          status: 'ready',
          state: '21.5',
          lastUpdated: '2026-01-01T10:00:00+00:00',
        },
        { entityId: 'light.room', status: 'not-found' },
      ],
      stale: false,
    });
    expect(JSON.stringify(result)).not.toContain('latitude');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(getAuthorizedResponse).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(getAuthorizedResponse)
        .mock.calls.map(([url]) => new URL(url).pathname)
        .sort(),
    ).toEqual(['/api/states/light.room', '/api/states/sensor.temperature']);

    vi.mocked(getAuthorizedResponse).mockClear();
    vi.mocked(getAuthorizedResponse).mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        entity_id: 'sensor.temperature',
        state: '21.5',
        last_updated: '2026-01-01T10:00:00+00:00',
        attributes: { latitude: 0 },
      }),
    });
    expect(await connections.connectionData(connection.id)).toMatchObject({
      data: { entityId: 'sensor.temperature', state: '21.5' },
    });
    expect(getAuthorizedResponse).toHaveBeenCalledTimes(1);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('notifies widget source cache invalidation when a connection is created, changed, or deleted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-ha-widget-invalidation-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  const changed: number[] = [];
  try {
    const connections = createIntegrationConnections(
      database.db,
      createVault(path),
      Date.now,
      (id) => changed.push(id),
    );
    const connection = await connections.createConnection({
      type: 'home-assistant',
      name: 'Home Assistant',
      url: 'https://ha.example.test',
      entityId: 'sensor.temperature',
      secret: 'synthetic-token',
      allowPrivate: true,
    });
    await connections.updateConnection(connection.id, {
      type: 'home-assistant',
      name: 'Home Assistant',
      url: 'https://ha.example.test',
      entityId: 'sensor.temperature',
      secret: 'synthetic-token',
      allowPrivate: true,
    });
    expect(await connections.deleteConnection(connection.id)).toBe('deleted');
    expect(changed).toEqual([connection.id, connection.id, connection.id]);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
