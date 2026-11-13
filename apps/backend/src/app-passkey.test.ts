import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createVirtualAuthenticator } from './test-passkey.js';
import { totpCode } from './test-totp.js';

describe('passkey API', () => {
  const origin = 'http://localhost:5173';
  const account = {
    name: 'Administrator',
    email: 'admin@homora.test',
    password: 'super-secure-password',
  };
  const BASE = '/api/auth/passkey';

  async function fresh() {
    const db = createDatabase(':memory:');
    const sqlite = getSqliteHandle(db.db);
    const auth = createAuth({ sqlite, secret: 'x'.repeat(48), webPort: 5173 });
    const app = createApp(db.db, 5173, auth, undefined, []);
    const call = (
      method: 'GET' | 'POST',
      url: string,
      payload?: object,
      cookie?: string,
      headers: Record<string, string> = {},
    ) =>
      app.inject({
        method,
        url,
        headers: { origin, ...(cookie ? { cookie } : {}), ...headers },
        payload,
      });
    await call('POST', '/api/auth/setup', account);
    const cookiesOf = (response: { headers: Record<string, unknown> }) =>
      ([] as string[])
        .concat((response.headers['set-cookie'] as string | string[] | undefined) ?? [])
        .map((cookie) => cookie.split(';')[0]!)
        .filter((pair) => !pair.endsWith('='));
    const session = async () => {
      const response = await call('POST', '/api/auth/sign-in/email', {
        email: account.email,
        password: account.password,
        rememberMe: false,
      });
      return cookiesOf(response).join('; ');
    };
    /** Adds a passkey through the whole ceremony; returns the final response. */
    const register = async (
      cookie: string,
      authenticator: ReturnType<typeof createVirtualAuthenticator>,
      name: string | undefined = 'Laptop',
      tamper: Parameters<ReturnType<typeof createVirtualAuthenticator>['register']>[1] = {},
    ) => {
      const started = await call(
        'POST',
        `${BASE}/generate-register-options`,
        { password: account.password },
        cookie,
      );
      expect(started.statusCode).toBe(200);
      const challengeCookie = cookiesOf(started).join('; ');
      return call(
        'POST',
        `${BASE}/verify-registration`,
        { response: authenticator.register(started.json(), tamper), ...(name ? { name } : {}) },
        `${cookie}; ${challengeCookie}`,
      );
    };
    const options = async () => {
      const response = await call('GET', `${BASE}/generate-authenticate-options`);
      return { json: response.json(), cookie: cookiesOf(response).join('; '), response };
    };
    const signIn = async (
      authenticator: ReturnType<typeof createVirtualAuthenticator>,
      tamper: Parameters<ReturnType<typeof createVirtualAuthenticator>['assert']>[1] = {},
      extra: object = {},
    ) => {
      const challenge = await options();
      return call(
        'POST',
        `${BASE}/verify-authentication`,
        { response: authenticator.assert(challenge.json, tamper), ...extra },
        challenge.cookie,
      );
    };
    const status = (cookie: string) =>
      call('GET', '/api/auth/status', undefined, cookie).then((r) => r.json());
    const activity = () =>
      sqlite
        .prepare('SELECT actor, action, result, detail FROM audit_events ORDER BY id')
        .all() as { actor: string; action: string; result: string; detail: string | null }[];
    return {
      sqlite,
      call,
      session,
      register,
      options,
      signIn,
      status,
      cookiesOf,
      activity,
      done: async () => {
        await app.close();
        db.close();
      },
    };
  }

  it('registers a passkey only for a signed-in administrator who confirms the password', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator();
      const noSession = await t.call('POST', `${BASE}/generate-register-options`, {
        password: account.password,
      });
      expect(noSession.statusCode).toBe(401);
      const cookie = await t.session();
      const wrong = await t.call(
        'POST',
        `${BASE}/generate-register-options`,
        { password: 'wrong-password' },
        cookie,
      );
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json().code).toBe('invalid-current-password');
      // The password never travels in a URL: the plugin's GET form is not reachable.
      expect(
        (await t.call('GET', `${BASE}/generate-register-options`, undefined, cookie)).statusCode,
      ).toBe(404);

      const started = await t.call(
        'POST',
        `${BASE}/generate-register-options`,
        { password: account.password },
        cookie,
      );
      const challenge = started.json();
      expect(challenge.rp).toMatchObject({ id: 'localhost', name: 'Homora' });
      expect(challenge.authenticatorSelection).toMatchObject({
        residentKey: 'required',
        userVerification: 'required',
      });
      expect(challenge.attestation).toBe('none');

      const added = await t.register(cookie, authenticator, '  My laptop  ');
      expect(added.statusCode).toBe(200);
      // Nothing about the credential beyond what the interface needs.
      expect(Object.keys(added.json()).sort()).toEqual([
        'backedUp',
        'createdAt',
        'deviceType',
        'id',
        'name',
        'transports',
      ]);
      const listed = await t.call('GET', `${BASE}/list-user-passkeys`, undefined, cookie);
      expect(listed.json()).toHaveLength(1);
      expect(listed.json()[0].name).toBe('My laptop');
      expect(JSON.stringify(listed.json())).not.toContain('publicKey');
      expect(JSON.stringify(listed.json())).not.toContain('credentialID');
      expect(
        t
          .activity()
          .filter((e) => e.action === 'passkey-add')
          .map((e) => e.result),
      ).toEqual(['failed', 'ok']);
    } finally {
      await t.done();
    }
  });

  it('refuses registrations that lack user verification or come from another origin or RP ID', async () => {
    const t = await fresh();
    try {
      const cookie = await t.session();
      const authenticator = createVirtualAuthenticator();
      for (const tamper of [
        { verified: false },
        { claimedOrigin: 'http://localhost:9999' },
        { claimedOrigin: 'https://evil.example' },
        { rpIdHash: 'evil.example' },
      ]) {
        const refused = await t.register(cookie, authenticator, 'Bad', tamper);
        expect(refused.statusCode).toBe(400);
        expect(refused.json().code).toBe('passkey-registration-failed');
      }
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get()).toEqual({ n: 0 });
      // Names are validated.
      const long = await t.register(cookie, authenticator, 'x'.repeat(61));
      expect(long.statusCode).toBe(400);
      expect(long.json().code).toBe('invalid-passkey-name');
    } finally {
      await t.done();
    }
  });

  it('signs in with a bound passkey without creating an account, and never leaks the token', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator();
      const cookie = await t.session();
      await t.register(cookie, authenticator);

      const response = await t.signIn(authenticator);
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Object.keys(body)).toEqual(['user']);
      expect(Object.keys(body.user)).toEqual(['id']);
      const session = t.cookiesOf(response).join('; ');
      expect(await t.status(session)).toMatchObject({ authenticated: true });
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get()).toEqual({ n: 1 });
      const login = t
        .activity()
        .find((e) => e.action === 'login' && e.detail?.startsWith('Passkey'));
      expect(login?.detail).toMatch(/^Passkey/);
      // Public status tells the interface where passkeys can be used, nothing else.
      expect((await t.status('')).passkey).toEqual({ origins: [origin] });
    } finally {
      await t.done();
    }
  });

  it('follows the 8-hour browser session by default and 30 days with "keep me signed in"', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator();
      await t.register(await t.session(), authenticator);
      const lifetime = () => {
        const row = t.sqlite
          .prepare('SELECT expiresAt FROM session ORDER BY createdAt DESC, rowid DESC LIMIT 1')
          .get() as { expiresAt: string };
        return (new Date(row.expiresAt).getTime() - Date.now()) / 3_600_000;
      };
      const short = await t.signIn(authenticator, { signCount: 1 });
      expect(lifetime()).toBeGreaterThan(7.9);
      expect(lifetime()).toBeLessThan(8.1);
      const shortCookie = ([] as string[]).concat(short.headers['set-cookie'] as string[]);
      const sessionCookie = shortCookie.find((c) => c.startsWith('homora.session_token='))!;
      // A browser-session cookie: it ends with the browser, not with a calendar date.
      expect(sessionCookie).not.toMatch(/max-age|expires/i);
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Strict/i);

      const long = await t.signIn(authenticator, { signCount: 2 }, { rememberMe: true });
      expect(lifetime()).toBeGreaterThan(29 * 24);
      const longCookie = ([] as string[])
        .concat(long.headers['set-cookie'] as string[])
        .find((c) => c.startsWith('homora.session_token='))!;
      expect(longCookie).toMatch(/max-age=\d+/i);
      // The header that carries the choice cannot be forged by a client.
      await t.signIn(authenticator, { signCount: 3 }, {});
      const forged = await (async () => {
        const challenge = await t.options();
        return t.call(
          'POST',
          `${BASE}/verify-authentication`,
          { response: authenticator.assert(challenge.json, { signCount: 4 }) },
          challenge.cookie,
          { 'x-homora-remember-me': '1' },
        );
      })();
      expect(forged.statusCode).toBe(200);
      expect(lifetime()).toBeLessThan(8.1);
    } finally {
      await t.done();
    }
  });

  it('refuses unknown credentials, replayed, tampered and unverified assertions with one answer', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator();
      const stranger = createVirtualAuthenticator();
      await t.register(await t.session(), authenticator);

      const answers = [
        await t.signIn(stranger),
        await t.signIn(authenticator, { verified: false }),
        await t.signIn(authenticator, { claimedOrigin: 'https://evil.example' }),
        await t.signIn(authenticator, { rpIdHash: 'evil.example' }),
        await t.signIn(authenticator, { challenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
      ];
      for (const answer of answers) {
        expect(answer.statusCode).toBeGreaterThanOrEqual(400);
        expect(answer.json().code).toBe('passkey-sign-in-failed');
        expect(String(answer.headers['set-cookie'] ?? '')).not.toContain('homora.session_token=');
      }

      // A challenge works once.
      const challenge = await t.options();
      const assertion = authenticator.assert(challenge.json);
      const first = await t.call(
        'POST',
        `${BASE}/verify-authentication`,
        { response: assertion },
        challenge.cookie,
      );
      expect(first.statusCode).toBe(200);
      const replay = await t.call(
        'POST',
        `${BASE}/verify-authentication`,
        { response: assertion },
        challenge.cookie,
      );
      expect(replay.statusCode).toBe(400);
      expect(replay.json().code).toBe('passkey-challenge-expired');

      // An expired challenge is gone.
      const stale = await t.options();
      t.sqlite.exec("UPDATE verification SET expiresAt = '2000-01-01T00:00:00.000Z'");
      const expired = await t.call(
        'POST',
        `${BASE}/verify-authentication`,
        { response: authenticator.assert(stale.json, { signCount: 9 }) },
        stale.cookie,
      );
      expect(expired.statusCode).toBe(400);
      expect(expired.json().code).toBe('passkey-challenge-expired');

      // No challenge cookie at all.
      const bare = await t.call('POST', `${BASE}/verify-authentication`, {
        response: authenticator.assert((await t.options()).json, { signCount: 10 }),
      });
      expect(bare.statusCode).toBe(400);

      const failures = t.activity().filter((e) => e.action === 'login' && e.result === 'failed');
      expect(failures.length).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(t.activity())).not.toMatch(/evil\.example|signature|AAAAAAAA/);
    } finally {
      await t.done();
    }
  });

  it('limits passkey sign-in attempts per client', async () => {
    const t = await fresh();
    try {
      const stranger = createVirtualAuthenticator();
      const codes: number[] = [];
      for (let attempt = 0; attempt < 11; attempt++)
        codes.push((await t.signIn(stranger)).statusCode);
      expect(codes.slice(0, 10).every((code) => code === 400 || code === 401)).toBe(true);
      expect(codes[10]).toBe(429);
    } finally {
      await t.done();
    }
  });

  it('is not satisfied or triggered by the local second step', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator();
      let cookie = await t.session();
      await t.register(cookie, authenticator);
      const started = await t.call(
        'POST',
        '/api/auth/two-factor/enable',
        { password: account.password },
        cookie,
      );
      const secret = new URL(started.json().totpURI).searchParams.get('secret')!;
      const confirmed = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totpCode(secret) },
        cookie,
      );
      cookie = t.cookiesOf(confirmed).join('; ');
      // Passwords now start a challenge; a verified passkey is a complete sign-in on its own.
      const password = await t.call('POST', '/api/auth/sign-in/email', {
        email: account.email,
        password: account.password,
      });
      expect(password.json().twoFactorRedirect).toBe(true);
      const passkey = await t.signIn(authenticator);
      expect(passkey.statusCode).toBe(200);
      expect(passkey.json().twoFactorRedirect).toBeUndefined();
      expect(await t.status(t.cookiesOf(passkey).join('; '))).toMatchObject({
        authenticated: true,
      });
    } finally {
      await t.done();
    }
  });

  it('manages several passkeys: rename, and remove with the password while ending other sessions', async () => {
    const t = await fresh();
    try {
      const first = createVirtualAuthenticator();
      const second = createVirtualAuthenticator();
      const cookie = await t.session();
      const other = await t.session();
      const a = (await t.register(cookie, first, 'First')).json();
      const b = (await t.register(cookie, second, 'Second')).json();
      expect(a.id).not.toBe(b.id);
      // The same authenticator is not added twice.
      expect((await t.register(cookie, first, 'Again')).statusCode).toBeGreaterThanOrEqual(400);
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get()).toEqual({ n: 2 });

      const renamed = await t.call(
        'POST',
        `${BASE}/update-passkey`,
        { id: a.id, name: ' Desk ' },
        cookie,
      );
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().name).toBe('Desk');
      expect(
        (await t.call('POST', `${BASE}/update-passkey`, { id: a.id, name: '' }, cookie)).statusCode,
      ).toBe(400);
      expect(
        (await t.call('POST', `${BASE}/update-passkey`, { id: a.id, name: 'x' })).statusCode,
      ).toBe(401);

      // Removal needs the password and a session.
      expect(
        (await t.call('POST', `${BASE}/delete-passkey`, { id: a.id, password: account.password }))
          .statusCode,
      ).toBe(401);
      const wrong = await t.call(
        'POST',
        `${BASE}/delete-passkey`,
        { id: a.id, password: 'nope-nope-nope' },
        cookie,
      );
      expect(wrong.statusCode).toBe(400);
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get()).toEqual({ n: 2 });
      expect(await t.status(other)).toMatchObject({ authenticated: true });

      const removed = await t.call(
        'POST',
        `${BASE}/delete-passkey`,
        { id: a.id, password: account.password },
        cookie,
      );
      expect(removed.statusCode).toBe(200);
      // A removed credential no longer signs in, the other one does, and old sessions ended.
      expect((await t.signIn(first, { signCount: 5 })).statusCode).toBeGreaterThanOrEqual(400);
      expect((await t.signIn(second, { signCount: 5 })).statusCode).toBe(200);
      expect(await t.status(other)).toMatchObject({ authenticated: false });
      expect(await t.status(cookie)).toMatchObject({ authenticated: true });

      // The last passkey can go too: the password keeps working.
      const last = await t.call(
        'POST',
        `${BASE}/delete-passkey`,
        { id: b.id, password: account.password },
        cookie,
      );
      expect(last.statusCode).toBe(200);
      expect((await t.session()).length).toBeGreaterThan(0);
      expect(t.activity().map((e) => e.action)).toEqual(
        expect.arrayContaining(['passkey-rename', 'passkey-remove']),
      );
    } finally {
      await t.done();
    }
  });

  it('forwards only the passkey routes the interface uses', async () => {
    const t = await fresh();
    try {
      const cookie = await t.session();
      for (const [method, url] of [
        ['GET', `${BASE}/other`],
        ['POST', `${BASE}/list-user-passkeys`],
        ['GET', `${BASE}/verify-authentication`],
        ['POST', `${BASE}/generate-authenticate-options`],
      ] as const)
        expect(
          (await t.call(method, url, method === 'POST' ? {} : undefined, cookie)).statusCode,
        ).toBe(404);
      // Adding a passkey never opens a session, whatever the body asks for.
      const before = t.sqlite.prepare('SELECT COUNT(*) AS n FROM session').get();
      await t.register(cookie, createVirtualAuthenticator());
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM session').get()).toEqual(before);
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get()).toEqual({ n: 1 });
      expect((await t.call('GET', `${BASE}/list-user-passkeys`)).statusCode).toBe(401);
    } finally {
      await t.done();
    }
  });

  it('does not let a client choose the origin or the RP ID through headers', async () => {
    const t = await fresh();
    try {
      const authenticator = createVirtualAuthenticator({
        origin: 'https://evil.example',
        rpId: 'evil.example',
      });
      const cookie = await t.session();
      const started = await t.call(
        'POST',
        `${BASE}/generate-register-options`,
        { password: account.password },
        cookie,
        { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', host: 'evil.example' },
      );
      expect(started.json().rp.id).toBe('localhost');
      const refused = await t.call(
        'POST',
        `${BASE}/verify-registration`,
        { response: authenticator.register(started.json()), name: 'Evil' },
        `${cookie}; ${t.cookiesOf(started).join('; ')}`,
        { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
      );
      expect(refused.statusCode).toBe(400);
    } finally {
      await t.done();
    }
  });
});
