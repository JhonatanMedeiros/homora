import { expect, it } from 'vitest';
import { createAppTestContext } from './app-test-context.js';

it('protects inbox routes and validates pagination and reading', async () => {
  const { app, cookie, close } = await createAppTestContext();
  try {
    expect((await app.inject({ method: 'GET', url: '/api/inbox' })).statusCode).toBe(401);
    const headers = { cookie, origin: 'http://localhost:5173' };
    expect(
      (await app.inject({ method: 'GET', url: '/api/inbox?limit=101', headers })).statusCode,
    ).toBe(400);
    const result = await app.inject({ method: 'GET', url: '/api/inbox', headers });
    expect(result.json()).toEqual({ items: [], nextBefore: null, unread: 0 });
    expect(
      (await app.inject({ method: 'POST', url: '/api/inbox/1/read', headers })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: '/api/inbox/read-all', headers })).statusCode,
    ).toBe(200);
  } finally {
    await close();
  }
});
