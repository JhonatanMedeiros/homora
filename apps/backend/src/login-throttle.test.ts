import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const PASSWORD = 'senha-para-testes';

function setup(trustProxy: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'homora-throttle-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup(PASSWORD);
  const app = createApp(db.db, 5173, auth, undefined, [], undefined, { trustProxy });
  const login = (password: string, forwardedFor?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: 'http://localhost:5173',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
      payload: { password },
    });
  return {
    login,
    done: async () => {
      await app.close();
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

it('behind trusted proxy, each client has their own rate limit bucket', async () => {
  const { login, done } = setup(true);
  try {
    for (let i = 0; i < 5; i++) expect((await login('wrong', '203.0.113.7')).statusCode).toBe(401);
    // client that failed is locked out, even with correct password...
    expect((await login(PASSWORD, '203.0.113.7')).statusCode).toBe(401);
    // ...but another client can still authenticate
    expect((await login(PASSWORD, '198.51.100.9')).statusCode).toBe(200);
  } finally {
    await done();
  }
});

it('without trusted proxy header is ignored, so spoofing it does not bypass the limit', async () => {
  const { login, done } = setup(false);
  try {
    for (let i = 0; i < 5; i++)
      expect((await login('wrong', `203.0.113.${i}`)).statusCode).toBe(401);
    // changing the reported IP does not reset the counter: real TCP peer is the same
    expect((await login(PASSWORD, '198.51.100.9')).statusCode).toBe(401);
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
