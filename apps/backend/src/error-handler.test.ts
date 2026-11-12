import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';

it('returns a safe response for unexpected failures and preserves client errors', async () => {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  app.get('/api/test-failure', async () => {
    throw new Error('private detail');
  });
  try {
    const failure = await app.inject({ url: '/api/test-failure', headers: { cookie } });
    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toEqual({
      code: 'internal-error',
      error: 'An unexpected server error occurred.',
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers: { cookie, origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: '{',
    });
    expect(malformed.statusCode).toBe(400);
  } finally {
    await app.close();
    database.close();
  }
});
