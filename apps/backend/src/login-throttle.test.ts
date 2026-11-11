import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createTestAuth, TEST_EMAIL, TEST_PASSWORD } from './test-auth.js';

const ATTEMPTS = 10;

async function setup(trustProxy: boolean) {
  const db = createDatabase(':memory:');
  const { auth } = await createTestAuth(db.db);
  const app = createApp(db.db, 5173, auth, undefined, [], undefined, { trustProxy });
  const login = (password: string, forwardedFor?: string, extra: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: 'http://localhost:5173',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        ...extra,
      },
      payload: { email: TEST_EMAIL, password },
    });
  return {
    login,
    done: async () => {
      await app.close();
      db.close();
    },
  };
}

it('behind trusted proxy, each client has their own rate limit bucket', async () => {
  const { login, done } = await setup(true);
  try {
    for (let i = 0; i < ATTEMPTS; i++)
      expect((await login('wrong', '203.0.113.7')).statusCode).toBe(401);
    // the client that exhausted its attempts is locked out, even with the correct password...
    const blocked = await login(TEST_PASSWORD, '203.0.113.7');
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['x-retry-after'])).toBeGreaterThan(0);
    // ...but another client can still authenticate
    expect((await login(TEST_PASSWORD, '198.51.100.9')).statusCode).toBe(200);
  } finally {
    await done();
  }
});

it('without trusted proxy the forwarded header is ignored, so spoofing it does not bypass the limit', async () => {
  const { login, done } = await setup(false);
  try {
    for (let i = 0; i < ATTEMPTS; i++)
      expect((await login('wrong', `203.0.113.${i}`)).statusCode).toBe(401);
    // changing the reported IP does not reset the counter: the real TCP peer is the same
    expect((await login(TEST_PASSWORD, '198.51.100.9')).statusCode).toBe(429);
  } finally {
    await done();
  }
});

it('a client cannot choose its own address through the internal client header', async () => {
  const { login, done } = await setup(true);
  try {
    // Every attempt claims a different address in the header the API reserves for itself.
    for (let i = 0; i < ATTEMPTS; i++)
      expect(
        (await login('wrong', '203.0.113.7', { 'x-homora-client-ip': `10.0.0.${i}` })).statusCode,
      ).toBe(401);
    const spoofed = await login(TEST_PASSWORD, '203.0.113.7', { 'x-homora-client-ip': '10.9.9.9' });
    expect(spoofed.statusCode).toBe(429);
  } finally {
    await done();
  }
});

it('reads HOMORA_TRUST_PROXY and rejects ambiguous values', () => {
  expect(loadConfig({}).trustProxy).toBe(false);
  expect(loadConfig({ HOMORA_TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  expect(loadConfig({ HOMORA_TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  expect(() => loadConfig({ HOMORA_TRUST_PROXY: '1' })).toThrow('HOMORA_TRUST_PROXY');
});

it('reads HOMORA_SESSION_SECRET and rejects short values', () => {
  expect(loadConfig({}).sessionSecret).toBeUndefined();
  expect(loadConfig({ HOMORA_SESSION_SECRET: 'x'.repeat(32) }).sessionSecret).toBe('x'.repeat(32));
  expect(() => loadConfig({ HOMORA_SESSION_SECRET: 'too-short' })).toThrow('HOMORA_SESSION_SECRET');
});
