import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { parseAllowedOrigins } from './config.js';
describe('API authentication', () => {
  const origin = 'http://localhost:5173';
  const account = {
    name: 'Administrator',
    email: 'admin@homora.test',
    password: 'super-secure-password',
  };
  function fresh(allowedOrigins: string[] = []) {
    const db = createDatabase(':memory:');
    const localAuth = createAuth({
      sqlite: getSqliteHandle(db.db),
      secret: 'x'.repeat(48),
      webPort: 5173,
      allowedOrigins,
    });
    const localApp = createApp(db.db, 5173, localAuth, undefined, allowedOrigins);
    return {
      localApp,
      sqlite: getSqliteHandle(db.db),
      signIn: (password: string, headers: Record<string, string> = { origin }) =>
        localApp.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers,
          payload: { email: account.email, password },
        }),
      setup: (headers: Record<string, string> = { origin }, payload: object = account) =>
        localApp.inject({ method: 'POST', url: '/api/auth/setup', headers, payload }),
      done: async () => {
        await localApp.close();
        db.close();
      },
    };
  }
  const cookieOf = (response: { headers: Record<string, unknown> }) =>
    String(response.headers['set-cookie']).split(';')[0];

  it('rate limits sign-in attempts and keeps limiting a blocked client', async () => {
    const { signIn, setup, done } = fresh();
    try {
      await setup();
      for (let attempt = 0; attempt < 10; attempt++)
        expect((await signIn('wrong-password')).statusCode).toBe(401);
      expect((await signIn('wrong-password')).statusCode).toBe(429);
      expect((await signIn(account.password)).statusCode).toBe(429);
    } finally {
      await done();
    }
  });

  it('creates the account once, authenticates, and terminates the session', async () => {
    const { localApp, sqlite, signIn, setup, done } = fresh();
    try {
      expect((await localApp.inject({ method: 'GET', url: '/api/services' })).statusCode).toBe(401);
      expect(
        (await localApp.inject({ url: '/api/services/1/maintenance/1/summary' })).statusCode,
      ).toBe(401);
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/monitoring/coverage' })).statusCode,
      ).toBe(401);
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/operational-summary' })).statusCode,
      ).toBe(401);
      expect((await localApp.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
        configured: false,
        authenticated: false,
        passkey: { origins: ['http://localhost:5173'] },
        oidc: { enabled: false },
      });
      expect((await setup({ origin }, { password: 'only-a-password' })).statusCode).toBe(400);
      expect((await setup({ origin }, { ...account, email: 'not-an-email' })).statusCode).toBe(400);
      expect((await setup({ origin }, { ...account, password: 'short' })).statusCode).toBe(400);
      expect((await setup()).statusCode).toBe(201);
      expect((await setup({ origin }, { ...account, email: 'other@homora.test' })).statusCode).toBe(
        403,
      );
      expect((await signIn('wrong-password')).statusCode).toBe(401);
      const login = await signIn(account.password);
      expect(login.statusCode).toBe(200);
      const setCookie = String(login.headers['set-cookie']);
      expect(setCookie).toContain('homora.session_token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie.split(',')[0]).not.toContain('Max-Age=');
      expect(setCookie).not.toContain('Secure');
      const cookie = cookieOf(login);
      expect(
        (await localApp.inject({ url: '/api/monitoring/coverage', headers: { cookie } }))
          .statusCode,
      ).toBe(200);
      sqlite.prepare('INSERT INTO monitors(id,name) VALUES(?,?)').run(701, 'Synthetic');
      sqlite.prepare('INSERT INTO monitors(id,name) VALUES(?,?)').run(702, 'Synthetic other');
      sqlite
        .prepare('INSERT INTO service_maintenance(id,service_id,starts_at,ends_at) VALUES(?,?,?,?)')
        .run(31, 701, Date.now() - 100_000, Date.now() - 10_000);
      const summary = await localApp.inject({
        url: '/api/services/701/maintenance/31/summary',
        headers: { cookie },
      });
      expect(summary.statusCode).toBe(200);
      expect(summary.json().state).toBe('insufficient');
      expect(
        (
          await localApp.inject({
            url: '/api/services/702/maintenance/31/summary',
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(404);
      sqlite
        .prepare('INSERT INTO service_incidents(id,service_id,started_at,reason) VALUES(?,?,?,?)')
        .run(99, 701, Date.now(), 'no-response');
      expect((await localApp.inject('/api/services/701/incidents/99')).statusCode).toBe(401);
      expect((await localApp.inject('/api/incidents/99/investigation')).statusCode).toBe(401);
      expect(
        (await localApp.inject({ url: '/api/incidents/99/investigation', headers: { cookie } }))
          .statusCode,
      ).toBe(200);
      expect(
        (await localApp.inject({ url: '/api/incidents/999/investigation', headers: { cookie } }))
          .statusCode,
      ).toBe(404);
      const incident = await localApp.inject({
        url: '/api/services/701/incidents/99',
        headers: { cookie },
      });
      expect(incident.statusCode).toBe(200);
      expect(incident.json()).toMatchObject({ id: 99, serviceId: 701 });
      expect(
        (await localApp.inject({ url: '/api/services/702/incidents/99', headers: { cookie } }))
          .statusCode,
      ).toBe(404);

      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: '/api/operational-summary',
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await localApp.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } })
        ).json(),
      ).toEqual({
        configured: true,
        authenticated: true,
        passkey: { origins: ['http://localhost:5173'] },
        oidc: { enabled: false },
      });
      await localApp.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: { origin, cookie },
      });
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
          .statusCode,
      ).toBe(401);
    } finally {
      await done();
    }
  });

  it('applies fixed lifetimes, persistent cookies, expiration and revocation to both choices', async () => {
    const { localApp, sqlite, setup, done } = fresh();
    try {
      await setup();
      const login = async (rememberMe: boolean) =>
        localApp.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers: { origin },
          payload: { email: account.email, password: account.password, rememberMe },
        });
      const ordinary = await login(false);
      const remembered = await login(true);
      const ordinaryHeader = String(ordinary.headers['set-cookie']);
      const rememberedHeader = String(remembered.headers['set-cookie']);
      expect(ordinaryHeader.split(',')[0]).not.toContain('Max-Age=');
      expect(rememberedHeader).toContain('Max-Age=2592000');
      const ordinaryCookie = cookieOf(ordinary);
      const rememberedCookie = cookieOf(remembered);
      const list = (
        await localApp.inject({
          method: 'GET',
          url: '/api/account/sessions',
          headers: { cookie: ordinaryCookie },
        })
      ).json();
      const current = list.find((row: { current: boolean }) => row.current);
      const other = list.find((row: { current: boolean }) => !row.current);
      expect(Date.parse(current.expiresAt) - Date.parse(current.createdAt)).toBeCloseTo(
        8 * 3600 * 1000,
        -3,
      );
      expect(Date.parse(other.expiresAt) - Date.parse(other.createdAt)).toBeCloseTo(
        30 * 24 * 3600 * 1000,
        -3,
      );
      expect(
        (
          await localApp.inject({
            method: 'POST',
            url: `/api/account/sessions/${other.id}/revoke`,
            headers: { origin, cookie: ordinaryCookie },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: '/api/services',
            headers: { cookie: rememberedCookie },
          })
        ).statusCode,
      ).toBe(401);
      const again = await login(true);
      const againCookie = cookieOf(again);
      expect(
        (
          await localApp.inject({
            method: 'POST',
            url: '/api/auth/sign-out',
            headers: { origin, cookie: againCookie },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: '/api/services',
            headers: { cookie: againCookie },
          })
        ).statusCode,
      ).toBe(401);
      sqlite.prepare('UPDATE session SET expiresAt = 0').run();
      expect(
        (
          await localApp.inject({
            method: 'GET',
            url: '/api/services',
            headers: { cookie: ordinaryCookie },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await done();
    }
  });

  it('never creates a second account, even from simultaneous setups', async () => {
    const { localApp, setup, done } = fresh();
    try {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => setup({ origin }, { ...account, email: `admin${n}@homora.test` })),
      );
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403, 403, 403]);
      expect((await localApp.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
        configured: true,
        authenticated: false,
        passkey: { origins: ['http://localhost:5173'] },
        oidc: { enabled: false },
      });
    } finally {
      await done();
    }
  });

  it('keeps public sign-up and unused Better Auth routes closed', async () => {
    const { localApp, setup, signIn, done } = fresh();
    try {
      await setup();
      const cookie = cookieOf(await signIn(account.password));
      for (const [method, url] of [
        ['POST', '/api/auth/sign-up/email'],
        ['POST', '/api/auth/change-password'],
        ['GET', '/api/auth/list-sessions'],
        ['POST', '/api/auth/request-password-reset'],
      ] as const) {
        const response = await localApp.inject({
          method,
          url,
          headers: { origin, cookie },
          payload: method === 'POST' ? {} : undefined,
        });
        expect(response.statusCode, url).toBe(404);
      }
    } finally {
      await done();
    }
  });

  it('rejects sign-in from an origin that is not allowed', async () => {
    const { signIn, setup, done } = fresh();
    try {
      await setup();
      expect((await signIn(account.password, { origin: 'http://evil.example' })).statusCode).toBe(
        403,
      );
    } finally {
      await done();
    }
  });

  it('sets Secure on allowed HTTPS sign-in and sign-out', async () => {
    const https = { origin: 'https://homora.example' };
    const { localApp, setup, signIn, done } = fresh(['https://homora.example']);
    try {
      expect((await setup(https)).statusCode).toBe(201);
      const login = await signIn(account.password, https);
      expect(login.statusCode).toBe(200);
      expect(String(login.headers['set-cookie'])).toContain('; Secure');
      const logout = await localApp.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: { ...https, cookie: cookieOf(login) },
      });
      expect(logout.statusCode).toBe(200);
      expect(String(logout.headers['set-cookie'])).toContain('; Secure');
    } finally {
      await done();
    }
  });
});

describe('HOMORA_ALLOWED_ORIGINS', () => {
  it('splits exact origins, eliminates duplicates, and rejects invalid values', () => {
    expect(
      parseAllowedOrigins('https://homora.example, http://localhost:8080,https://homora.example'),
    ).toEqual(['https://homora.example', 'http://localhost:8080']);
    for (const value of [
      'https://example.test/path',
      'https://example.test/',
      'http://example.test',
      '*,https://ok.test',
      'https://u:p@example.test',
    ])
      expect(() => parseAllowedOrigins(value)).toThrow();
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});
