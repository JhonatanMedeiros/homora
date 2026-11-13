import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { createTestAuth } from './test-auth.js';

export async function createAppTestContext() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(database.db);
  const app = createApp(database.db, 5173, auth);

  async function clean() {
    const response = await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } });
    for (const service of response.json() as { id: number }[])
      await app.inject({
        method: 'DELETE',
        url: `/api/services/${service.id}`,
        headers: { origin: 'http://localhost:5173', cookie },
      });
    const groups = await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } });
    for (const group of groups.json() as { id: number }[])
      await app.inject({
        method: 'DELETE',
        url: `/api/groups/${group.id}`,
        headers: { origin: 'http://localhost:5173', cookie },
      });
  }

  async function close() {
    await app.close();
    database.close();
  }

  return { app, cookie, clean, close };
}
