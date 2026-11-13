import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import {
  AccountExistsError,
  createAuth,
  createRateLimitStorage,
  loadSessionSecret,
} from './auth.js';
import { createTestAuth, TEST_EMAIL, TEST_PASSWORD } from './test-auth.js';

describe('loadSessionSecret', () => {
  it('creates a private secret once and reuses it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-secret-test-'));
    try {
      const path = join(dir, 'secret');
      const first = loadSessionSecret(path);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(loadSessionSecret(path)).toBe(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefers the configured secret and rejects a corrupted file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-secret-test-'));
    try {
      const path = join(dir, 'secret');
      expect(loadSessionSecret(path, 'configured-secret')).toBe('configured-secret');
      expect(() => statSync(path)).toThrow();
      writeFileSync(path, 'not-a-secret');
      expect(() => loadSessionSecret(path)).toThrow('Invalid session secret file.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('createAuth', () => {
  it('creates one account, stores only a password hash and identifies the session', async () => {
    const database = createDatabase(':memory:');
    try {
      const sqlite = getSqliteHandle(database.db);
      const { auth, cookie } = await createTestAuth(database.db);
      expect(auth.configured()).toBe(true);
      await expect(
        auth.setup({ name: 'Other', email: 'other@homora.test', password: TEST_PASSWORD }),
      ).rejects.toBeInstanceOf(AccountExistsError);
      const row = sqlite.prepare('SELECT password FROM account').get() as { password: string };
      expect(row.password).not.toContain(TEST_PASSWORD);
      expect(row.password.length).toBeGreaterThan(64);
      expect((sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get() as { n: number }).n).toBe(1);
      expect(await auth.session({})).toBeNull();
      expect(await auth.session({ cookie: 'homora.session_token=forged' })).toBeNull();
      expect(await auth.session({ cookie })).toEqual({
        userId: expect.any(String),
        twoFactorEnabled: false,
      });
      await expect(auth.createSessionCookie(TEST_EMAIL, 'wrong-password')).rejects.toThrow();
    } finally {
      database.close();
    }
  });

  it('persists the account and sessions across instances sharing the database', async () => {
    const database = createDatabase(':memory:');
    try {
      const { cookie } = await createTestAuth(database.db);
      const restarted = createAuth({
        sqlite: getSqliteHandle(database.db),
        secret: 'test-secret-'.repeat(4),
        webPort: 5173,
      });
      expect(restarted.configured()).toBe(true);
      expect(await restarted.session({ cookie })).not.toBeNull();
    } finally {
      database.close();
    }
  });

  it('does not accept a session cookie signed with a different secret', async () => {
    const database = createDatabase(':memory:');
    try {
      const { cookie } = await createTestAuth(database.db);
      const other = createAuth({
        sqlite: getSqliteHandle(database.db),
        secret: 'another-secret-'.repeat(4),
        webPort: 5173,
      });
      expect(await other.session({ cookie })).toBeNull();
    } finally {
      database.close();
    }
  });
});

describe('database schema', () => {
  it('has every table and column Better Auth requires', async () => {
    const database = createDatabase(':memory:');
    try {
      const { auth } = await createTestAuth(database.db);
      const { toBeCreated, toBeAdded } = await getMigrations(auth.options);
      expect(toBeCreated.map((table) => table.table)).toEqual([]);
      expect(toBeAdded.map((table) => table.table)).toEqual([]);
    } finally {
      database.close();
    }
  });
});

it('keeps telemetry disabled', async () => {
  const database = createDatabase(':memory:');
  try {
    const { auth } = await createTestAuth(database.db);
    expect(auth.options.telemetry?.enabled).toBe(false);
    expect(typeof betterAuth).toBe('function');
  } finally {
    database.close();
  }
});

describe('createRateLimitStorage', () => {
  it('limits within the window, resets after it and keeps keys independent', async () => {
    let time = 1_000;
    const storage = createRateLimitStorage(() => time);
    const rule = { window: 60, max: 2 };
    expect((await storage.consume('a', rule)).allowed).toBe(true);
    expect((await storage.consume('a', rule)).allowed).toBe(true);
    const blocked = await storage.consume('a', rule);
    expect(blocked).toEqual({ allowed: false, retryAfter: 60 });
    expect((await storage.consume('b', rule)).allowed).toBe(true);
    time += 59_000;
    expect(await storage.consume('a', rule)).toEqual({ allowed: false, retryAfter: 1 });
    time += 1_000;
    expect((await storage.consume('a', rule)).allowed).toBe(true);
  });

  it('is not shared between instances', async () => {
    const rule = { window: 60, max: 1 };
    const first = createRateLimitStorage();
    const second = createRateLimitStorage();
    await first.consume('same-client', rule);
    expect((await first.consume('same-client', rule)).allowed).toBe(false);
    expect((await second.consume('same-client', rule)).allowed).toBe(true);
  });
});
