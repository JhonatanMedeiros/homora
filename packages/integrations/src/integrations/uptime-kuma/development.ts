import type { DatabaseSync } from 'node:sqlite';

export function seedDevelopmentMock(sqlite: DatabaseSync) {
  if (
    sqlite
      .prepare(
        "SELECT id FROM integration_instances WHERE type='uptime-kuma' AND name='Demo Uptime Kuma (mock)'",
      )
      .get()
  )
    return;
  sqlite
    .prepare(
      "INSERT INTO integration_instances(type,name,public_config) VALUES('uptime-kuma','Demo Uptime Kuma (mock)',?)",
    )
    .run(JSON.stringify({ url: 'https://kuma.mock.invalid', slug: 'home' }));
}
export function developmentMockData(connection: { type: string; name: string }) {
  if (connection.type !== 'uptime-kuma' || connection.name !== 'Demo Uptime Kuma (mock)')
    return null;
  return {
    data: {
      up: 1,
      down: 1,
      pending: 1,
      maintenance: 1,
      unknown: 1,
      monitors: [
        { id: 1, name: 'Web', group: 'Services', status: 'up' },
        { id: 2, name: 'Database', group: 'Services', status: 'down' },
        { id: 3, name: 'Queue', group: 'Services', status: 'pending' },
        { id: 4, name: 'Worker', group: 'Infrastructure', status: 'maintenance' },
        { id: 5, name: 'New service', group: 'Infrastructure', status: 'unknown' },
      ],
    },
    checkedAt: new Date().toISOString(),
  };
}
export function developmentMockInventory() {
  return null;
}
