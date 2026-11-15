import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, getSqliteHandle, MigrationHistoryError } from '@homora/db';
import { createApp, HEALTH_PATH } from './app.js';
import { loadConfig } from './config.js';
import { createLogger, parseLogLevel, type LogLevel } from './logger.js';
import { createNotifications } from './notifications/index.js';
import * as network from './network-request.js';
import { createVault } from './vault.js';
import { createTestSession } from './test-auth.js';
import { installFatalErrorHandlers } from './shutdown.js';

type Line = Record<string, unknown> & { level: number; msg?: string };

function capture(level: LogLevel = 'debug') {
  const chunks: string[] = [];
  const logger = createLogger({ level, stream: { write: (line) => void chunks.push(line) } });
  return {
    logger,
    text: () => chunks.join(''),
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Line),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('logger configuration', () => {
  it('reads HOMORA_LOG_LEVEL, defaulting to info, and rejects unknown levels', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('')).toBe('info');
    expect(parseLogLevel('WARN')).toBe('warn');
    expect(parseLogLevel('silent')).toBe('silent');
    expect(() => parseLogLevel('verbose')).toThrow(/HOMORA_LOG_LEVEL/);
    expect(loadConfig({ HOMORA_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
    expect(loadConfig({}).logLevel).toBe('info');
  });

  it('writes JSON lines and honours the level, including silent', () => {
    const verbose = capture('info');
    verbose.logger.debug('hidden');
    verbose.logger.info({ a: 1 }, 'shown');
    expect(verbose.lines()).toMatchObject([{ msg: 'shown', a: 1 }]);
    const silent = capture('silent');
    silent.logger.error('nothing');
    silent.logger.fatal('nothing either');
    expect(silent.text()).toBe('');
  });
});

describe('request logging and the error handler', () => {
  async function setup(level: LogLevel = 'debug') {
    const log = capture(level);
    const database = createDatabase(':memory:');
    const { auth, cookie } = await createTestSession();
    const app = createApp(database.db, 5173, auth, undefined, [], undefined, {
      logger: log.logger,
    });
    return { log, app, cookie, close: async () => (await app.close(), database.close()) };
  }

  it('logs the original error, route and method of a 5xx, and keeps the response body', async () => {
    const { log, app, cookie, close } = await setup();
    app.get('/api/boom/:id', async () => {
      throw new Error('disk exploded');
    });
    try {
      const response = await app.inject({ url: '/api/boom/7?token=abc', headers: { cookie } });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: 'internal-error',
        error: 'An unexpected server error occurred.',
      });
      const failure = log.lines().find((line) => line.msg === 'request failed')!;
      expect(failure).toMatchObject({
        level: 50,
        method: 'GET',
        url: '/api/boom/7',
        route: '/api/boom/:id',
        err: { message: 'disk exploded' },
      });
      expect(String((failure.err as { stack?: string }).stack)).toContain('disk exploded');
      expect(typeof failure.reqId).toBe('string');
      expect(log.text()).not.toContain('abc');
    } finally {
      await close();
    }
  });

  it('never writes cookies, Authorization, tokens, passwords or secrets to the log', async () => {
    const { log, app, cookie, close } = await setup();
    app.post('/api/leaky', async (request) => {
      // Even if a handler attaches sensitive objects by mistake, redaction removes them.
      request.log.error(
        {
          headers: { authorization: 'Bearer hunter2-token', cookie: 'sid=cookie-secret' },
          integration: { token: 'integration-token-value', password: 'p4ss-word-value' },
          sessionSecret: 'session-secret-value',
          body: request.body,
        },
        'leak attempt',
      );
      throw new Error('after the leak');
    });
    try {
      await app.inject({
        method: 'POST',
        url: '/api/leaky?apiKey=query-secret&token=query-token',
        headers: {
          cookie,
          authorization: 'Bearer hunter2-token',
          origin: 'http://localhost:5173',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ email: 'a@b.c', password: 'login-body-password' }),
      });
      await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
        payload: JSON.stringify({ email: 'a@b.c', password: 'login-body-password' }),
      });
      const text = log.text();
      expect(text).toContain('leak attempt');
      for (const secret of [
        'hunter2-token',
        'cookie-secret',
        'integration-token-value',
        'p4ss-word-value',
        'session-secret-value',
        'login-body-password',
        'query-secret',
        'query-token',
        'test-session',
      ])
        expect(text, secret).not.toContain(secret);
    } finally {
      await close();
    }
  });

  it('keeps the health check out of the request log and logs nothing when silent', async () => {
    const { log, app, close } = await setup('info');
    try {
      await app.inject({ url: HEALTH_PATH });
      expect(log.lines().filter((line) => JSON.stringify(line).includes('/api/health'))).toEqual(
        [],
      );
    } finally {
      await close();
    }
    const silent = await setup('silent');
    try {
      await silent.app.inject({ url: '/api/nope', headers: { cookie: silent.cookie } });
      expect(silent.log.text()).toBe('');
    } finally {
      await silent.close();
    }
  });

  it('logs storage failures while publishing monitor results instead of swallowing them', async () => {
    const log = capture();
    const database = createDatabase(':memory:');
    const sqlite = getSqliteHandle(database.db);
    const { auth } = await createTestSession();
    sqlite.exec(
      "INSERT INTO monitors(id,name) VALUES(1,'A'); INSERT INTO services(id,url,category,description) VALUES(1,'http://127.0.0.1:9/','x','')",
    );
    sqlite.exec(
      "CREATE TRIGGER fail_publish BEFORE INSERT ON service_observations BEGIN SELECT RAISE(ABORT,'storage down'); END",
    );
    const app = createApp(database.db, 5173, auth, undefined, [], undefined, {
      logger: log.logger,
    });
    try {
      await vi.waitFor(() =>
        expect(
          log.lines().find((line) => line.msg === 'could not publish service observations'),
        ).toMatchObject({ level: 50, err: { message: expect.stringContaining('storage down') } }),
      );
    } finally {
      await app.close();
      database.close();
    }
  });
});

describe('/api/health', () => {
  it('is public, exposes no sensitive data and reports database and monitor state', async () => {
    const database = createDatabase(':memory:');
    const { auth } = await createTestSession();
    const app = createApp(database.db, 5173, auth);
    try {
      await vi.waitFor(async () => {
        const response = await app.inject({ url: HEALTH_PATH });
        expect(response.statusCode).toBe(200);
        const body = response.json<{
          status: string;
          schemaVersion: number;
          database: string;
          monitor: { status: string; lastCycleAgeSeconds: number };
        }>();
        expect(body).toMatchObject({ status: 'ok', database: 'ok', monitor: { status: 'ok' } });
        expect(body.schemaVersion).toBeGreaterThan(0);
        expect(Object.keys(body).sort()).toEqual([
          'commit',
          'database',
          'monitor',
          'releaseTag',
          'schemaVersion',
          'status',
          'version',
        ]);
      });
      const unavailable = getSqliteHandle(database.db);
      unavailable.exec('ALTER TABLE __drizzle_migrations RENAME TO hidden_migrations');
      const broken = await app.inject({ url: HEALTH_PATH });
      expect(broken.statusCode).toBe(503);
      expect(broken.json()).toMatchObject({ status: 'unhealthy', database: 'error' });
    } finally {
      await app.close();
      database.close();
    }
  });

  it('reports a stalled monitor once its last cycle is too old', async () => {
    vi.useFakeTimers();
    const database = createDatabase(':memory:');
    const { auth } = await createTestSession();
    const app = createApp(database.db, 5173, auth);
    try {
      await vi.advanceTimersByTimeAsync(1_000);
      expect((await app.inject({ url: HEALTH_PATH })).statusCode).toBe(200);
      vi.setSystemTime(Date.now() + 10 * 60_000);
      const stalled = await app.inject({ url: HEALTH_PATH });
      expect(stalled.statusCode).toBe(503);
      expect(stalled.json()).toMatchObject({ monitor: { status: 'stalled' } });
    } finally {
      vi.useRealTimers();
      await app.close();
      database.close();
    }
  });
});

describe('migrator report', () => {
  it('reports what was applied and refuses a database from a newer build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-migrations-'));
    const path = join(dir, 'db.sqlite');
    try {
      const first = createDatabase(path);
      expect(first.migrations).toMatchObject({ alreadyApplied: 0 });
      expect(first.migrations.appliedNow).toBe(first.migrations.known);
      expect(first.migrations.latest).toMatch(/^\d{4}-/);
      getSqliteHandle(first.db)
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run('from-the-future', Date.now() + 1e9);
      first.close();
      const second = (() => {
        try {
          return createDatabase(path);
        } catch (error) {
          return error;
        }
      })();
      expect(second).toBeInstanceOf(MigrationHistoryError);
      expect((second as MigrationHistoryError).details).toMatchObject({
        reason: 'schema-ahead',
        recorded: (second as MigrationHistoryError).details.known + 1,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an up to date database as nothing applied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'homora-migrations-'));
    const path = join(dir, 'db.sqlite');
    try {
      createDatabase(path).close();
      const again = createDatabase(path);
      expect(again.migrations).toMatchObject({ appliedNow: 0 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('notification delivery failures', () => {
  it('logs the channel and the failure without the destination or token', async () => {
    const log = capture();
    const dir = mkdtempSync(join(tmpdir(), 'homora-notify-log-'));
    const path = join(dir, 'db.sqlite');
    const database = createDatabase(path);
    const db = getSqliteHandle(database.db);
    vi.spyOn(network, 'getAuthorizedResponse').mockRejectedValue(
      Object.assign(new Error('Connection failed.'), { code: 'ECONNREFUSED' }),
    );
    try {
      const notifier = createNotifications(db, createVault(path), log.logger);
      const channel = notifier.save({
        name: 'Hook',
        type: 'webhook',
        enabled: true,
        allowPrivate: false,
        includeUrl: false,
        destination: 'https://hooks.example/very-secret-path',
      })!;
      expect(await notifier.test(channel.id)).toBe('Delivery failed');
      const failure = log.lines().find((line) => line.msg === 'notification delivery failed')!;
      expect(failure).toMatchObject({
        level: 40,
        channel: channel.id,
        channelType: 'webhook',
        errorCode: 'ECONNREFUSED',
        errorMessage: 'Connection failed.',
      });
      expect(log.text()).not.toContain('very-secret-path');
    } finally {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fatal error handlers', () => {
  it('logs the error and shuts down with a failure code', () => {
    const listeners = new Map<string, (error: unknown) => void>();
    const logFatal = vi.fn();
    const shutdown = vi.fn(async () => undefined);
    installFatalErrorHandlers({
      on: (event, listener) => void listeners.set(event, listener),
      logFatal,
      shutdown,
    });
    const error = new Error('boom');
    listeners.get('uncaughtException')!(error);
    listeners.get('unhandledRejection')!(error);
    expect(logFatal).toHaveBeenNthCalledWith(1, error, 'uncaughtException');
    expect(logFatal).toHaveBeenNthCalledWith(2, error, 'unhandledRejection');
    expect(shutdown).toHaveBeenCalledWith('uncaughtException', 1);
  });
});
