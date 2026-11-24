import type { DatabaseSync } from 'node:sqlite';

const prefix = 'Demo Coolify (mock';
export function seedDevelopmentMock(sqlite: DatabaseSync) {
  for (const suffix of [')', ' empty)', ' auth error)']) {
    const name = prefix + suffix;
    if (
      sqlite
        .prepare('SELECT id FROM integration_instances WHERE type = ? AND name = ?')
        .get('coolify', name)
    )
      continue;
    sqlite
      .prepare('INSERT INTO integration_instances(type,name,public_config) VALUES(?,?,?)')
      .run('coolify', name, JSON.stringify({ url: 'https://coolify.mock.invalid' }));
  }
}
export function developmentMockData() {
  return null;
}
export function developmentMockInventory() {
  return null;
}
export function developmentMockResources(connection: { type: string; name: string }) {
  if (connection.type !== 'coolify' || !connection.name.startsWith(prefix)) return null;
  if (connection.name === `${prefix} auth error)`)
    throw new Error('Synthetic authentication failure');
  const resources =
    connection.name === `${prefix} empty)`
      ? []
      : [
          {
            uuid: 'demo-web',
            name: 'Web',
            type: 'application',
            state: 'running',
            rawStatus: 'running:healthy',
            urls: ['https://web.example.test/', 'https://www.example.test/'],
            description: null,
            environmentId: 1,
          },
          {
            uuid: 'demo-worker',
            name: 'Worker',
            type: 'service',
            state: 'degraded',
            rawStatus: 'running:unhealthy',
            urls: [],
            description: null,
            environmentId: 1,
          },
          {
            uuid: 'demo-old',
            name: 'Old app',
            type: 'application',
            state: 'stopped',
            rawStatus: 'exited',
            urls: [],
            description: null,
            environmentId: 1,
          },
          {
            uuid: 'demo-queue',
            name: 'Queue',
            type: 'service',
            state: 'unknown',
            rawStatus: 'restarting',
            urls: [],
            description: null,
            environmentId: 1,
          },
        ];
  return { data: { resources }, checkedAt: new Date().toISOString() };
}
