import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { totpCode as totp } from './test-totp.js';

describe('two-factor authentication API', () => {
  const origin = 'http://localhost:5173';
  const account = {
    name: 'Administrator',
    email: 'admin@homora.test',
    password: 'super-secure-password',
  };

  async function fresh() {
    const db = createDatabase(':memory:');
    const sqlite = getSqliteHandle(db.db);
    const auth = createAuth({ sqlite, secret: 'x'.repeat(48), webPort: 5173 });
    const app = createApp(db.db, 5173, auth, undefined, []);
    const call = (method: 'GET' | 'POST', url: string, payload?: object, cookie?: string) =>
      app.inject({
        method,
        url,
        headers: { origin, ...(cookie ? { cookie } : {}) },
        payload,
      });
    await call('POST', '/api/auth/setup', account);
    const cookiesOf = (response: { headers: Record<string, unknown> }) =>
      ([] as string[])
        .concat((response.headers['set-cookie'] as string | string[] | undefined) ?? [])
        .map((cookie) => cookie.split(';')[0])
        .filter((pair) => !pair.endsWith('='));
    const signIn = async (rememberMe = false) => {
      const response = await call('POST', '/api/auth/sign-in/email', {
        email: account.email,
        password: account.password,
        rememberMe,
      });
      return {
        response,
        cookies: cookiesOf(response).join('; '),
        raw: response.headers['set-cookie'],
      };
    };
    const session = async () => (await signIn()).cookies;
    /** Runs the whole setup and returns the new session cookie, the secret and recovery codes. */
    const enable = async (cookie: string) => {
      const started = await call(
        'POST',
        '/api/auth/two-factor/enable',
        { password: account.password },
        cookie,
      );
      const { totpURI, backupCodes } = started.json() as { totpURI: string; backupCodes: string[] };
      const secret = new URL(totpURI).searchParams.get('secret')!;
      const confirmed = await call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret) },
        cookie,
      );
      return {
        started,
        confirmed,
        secret,
        totpURI,
        backupCodes,
        cookie: cookiesOf(confirmed).join('; '),
      };
    };
    const challenge = async (rememberMe = false) => {
      const { response, cookies, raw } = await signIn(rememberMe);
      return { response, challengeCookies: cookies, raw };
    };
    const activity = () =>
      sqlite
        .prepare('SELECT actor, action, result, detail FROM audit_events ORDER BY id')
        .all() as {
        actor: string;
        action: string;
        result: string;
        detail: string | null;
      }[];
    return {
      app,
      sqlite,
      call,
      signIn,
      session,
      enable,
      challenge,
      cookiesOf,
      activity,
      done: async () => {
        await app.close();
        db.close();
      },
    };
  }

  it('is off by default and only turns on after a valid code confirms the setup', async () => {
    const t = await fresh();
    try {
      const cookie = await t.session();
      expect((await t.call('GET', '/api/account', undefined, cookie)).json().twoFactorEnabled).toBe(
        false,
      );
      // Wrong password: nothing is generated.
      const refused = await t.call(
        'POST',
        '/api/auth/two-factor/enable',
        { password: 'wrong-password' },
        cookie,
      );
      expect(refused.statusCode).toBe(400);
      expect(refused.json().code).toBe('invalid-current-password');
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM "twoFactor"').get()).toEqual({ n: 0 });
      // Without a session the setup route is closed.
      expect(
        (await t.call('POST', '/api/auth/two-factor/enable', { password: account.password }))
          .statusCode,
      ).toBe(401);

      const started = await t.call(
        'POST',
        '/api/auth/two-factor/enable',
        { password: account.password },
        cookie,
      );
      expect(started.statusCode).toBe(200);
      const { totpURI, backupCodes } = started.json();
      expect(totpURI).toMatch(/^otpauth:\/\/totp\/Homora:/);
      expect(backupCodes).toHaveLength(10);
      // Started but not confirmed: sign-in still needs only the password.
      expect((await t.call('GET', '/api/account', undefined, cookie)).json().twoFactorEnabled).toBe(
        false,
      );
      expect((await t.signIn()).response.json().twoFactorRedirect).toBeUndefined();

      const secret = new URL(totpURI).searchParams.get('secret')!;
      const wrong = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret) === '000000' ? '111111' : '000000' },
        cookie,
      );
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().code).toBe('two-factor-invalid-code');
      expect((await t.call('GET', '/api/account', undefined, cookie)).json().twoFactorEnabled).toBe(
        false,
      );

      const confirmed = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret) },
        cookie,
      );
      expect(confirmed.statusCode).toBe(200);
      const fresh = t.cookiesOf(confirmed).join('; ');
      expect((await t.call('GET', '/api/account', undefined, fresh)).json().twoFactorEnabled).toBe(
        true,
      );
      expect(
        t
          .activity()
          .filter((e) => e.action === 'two-factor-enable')
          .map((e) => e.result),
      ).toEqual(['failed', 'ok']);
      // Enabling a second time is refused.
      const again = await t.call(
        'POST',
        '/api/auth/two-factor/enable',
        { password: account.password },
        fresh,
      );
      expect(again.json().code).toBe('two-factor-already-enabled');
    } finally {
      await t.done();
    }
  });

  it('ends other sessions when the second step is enabled and keeps the chosen lifetime', async () => {
    const t = await fresh();
    try {
      const current = (await t.signIn(false)).cookies;
      const other = (await t.signIn(true)).cookies;
      const { cookie } = await t.enable(current);
      expect((await t.call('GET', '/api/services', undefined, other)).statusCode).toBe(401);
      expect((await t.call('GET', '/api/services', undefined, cookie)).statusCode).toBe(200);
      const [row] = (await t.call('GET', '/api/account/sessions', undefined, cookie)).json();
      expect(Date.parse(row.expiresAt) - Date.parse(row.createdAt)).toBeLessThan(
        8 * 3600_000 + 5_000,
      );
    } finally {
      await t.done();
    }
  });

  it('does not grant access or record a login before the code is verified', async () => {
    const t = await fresh();
    try {
      const { cookie, secret } = await t.enable(await t.session());
      expect(cookie).not.toBe('');
      const before = t.activity().filter((e) => e.action === 'login' && e.result === 'ok').length;
      const { response, challengeCookies } = await t.challenge();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        twoFactorRedirect: true,
        twoFactorMethods: ['totp'],
      });
      expect(challengeCookies).not.toContain('session_token');
      expect(challengeCookies).toContain('homora.two_factor=');
      expect((await t.call('GET', '/api/services', undefined, challengeCookies)).statusCode).toBe(
        401,
      );
      expect(
        (await t.call('GET', '/api/auth/status', undefined, challengeCookies)).json().authenticated,
      ).toBe(false);
      expect(t.activity().filter((e) => e.action === 'login' && e.result === 'ok')).toHaveLength(
        before,
      );

      const verified = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret) },
        challengeCookies,
      );
      expect(verified.statusCode).toBe(200);
      const sessionCookie = t.cookiesOf(verified).join('; ');
      expect((await t.call('GET', '/api/services', undefined, sessionCookie)).statusCode).toBe(200);
      expect(t.activity().filter((e) => e.action === 'login' && e.result === 'ok')).toHaveLength(
        before + 1,
      );
    } finally {
      await t.done();
    }
  });

  it('refuses wrong, missing and tampered challenges and ends a challenge after five wrong codes', async () => {
    const t = await fresh();
    try {
      const { secret } = await t.enable(await t.session());
      const { challengeCookies } = await t.challenge();
      const verify = (code: string, cookie?: string) =>
        t.call('POST', '/api/auth/two-factor/verify-totp', { code }, cookie);
      const right = totp(secret);
      const wrong = right === '123456' ? '654321' : '123456';
      const noChallenge = await verify(right);
      expect(noChallenge.statusCode).toBe(401);
      expect(noChallenge.json().code).toBe('two-factor-challenge-expired');
      const tampered = await verify(
        right,
        challengeCookies.replace(/two_factor=[^;]+/, 'homora.two_factor=forged.value'),
      );
      expect(tampered.statusCode).toBe(401);
      // An expired code (two steps old) is not accepted either.
      expect((await verify(totp(secret, -3), challengeCookies)).json().code).toBe(
        'two-factor-invalid-code',
      );
      for (let attempt = 0; attempt < 3; attempt++)
        expect((await verify(wrong, challengeCookies)).statusCode).toBe(401);
      // Five misses burn the challenge: even the right code no longer works with it.
      expect((await verify(wrong, challengeCookies)).statusCode).toBe(401);
      const burnt = await verify(right, challengeCookies);
      expect(burnt.statusCode).toBeGreaterThanOrEqual(400);
      expect(burnt.headers['set-cookie']).not.toContain('session_token=');
      expect(
        t.activity().filter((e) => e.action === 'login' && e.result === 'failed').length,
      ).toBeGreaterThanOrEqual(5);
    } finally {
      await t.done();
    }
  });

  it('blocks further codes after ten wrong ones, even a correct one', async () => {
    const t = await fresh();
    try {
      const { secret } = await t.enable(await t.session());
      const wrong = totp(secret) === '123456' ? '654321' : '123456';
      let challengeCookies = (await t.challenge()).challengeCookies;
      // The confirmation of the setup already used one request of the verification budget.
      for (let attempt = 1; attempt <= 9; attempt++) {
        if (attempt % 4 === 0) challengeCookies = (await t.challenge()).challengeCookies;
        expect(
          (
            await t.call(
              'POST',
              '/api/auth/two-factor/verify-totp',
              { code: wrong },
              challengeCookies,
            )
          ).statusCode,
        ).toBe(401);
      }
      const blocked = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret) },
        challengeCookies,
      );
      expect(blocked.statusCode).toBe(429);
      expect(String(blocked.headers['set-cookie'] ?? '')).not.toContain('session_token=');
      expect(Number(blocked.headers['x-retry-after'])).toBeGreaterThan(0);
    } finally {
      await t.done();
    }
  });

  it('accepts each recovery code once and invalidates the old set when regenerated', async () => {
    const t = await fresh();
    try {
      const { backupCodes, cookie } = await t.enable(await t.session());
      const useCode = async (code: string) => {
        const { challengeCookies } = await t.challenge();
        const response = await t.call(
          'POST',
          '/api/auth/two-factor/verify-backup-code',
          { code },
          challengeCookies,
        );
        return response;
      };
      const first = await useCode(backupCodes[0]);
      expect(first.statusCode).toBe(200);
      expect((await useCode(backupCodes[0])).statusCode).toBe(401);
      expect(t.activity().some((e) => e.action === 'two-factor-recovery-used')).toBe(true);

      // Regeneration asks for the password again and replaces every previous code.
      const refused = await t.call(
        'POST',
        '/api/auth/two-factor/generate-backup-codes',
        { password: 'nope-nope-nope' },
        cookie,
      );
      expect(refused.json().code).toBe('invalid-current-password');
      expect((await useCode(backupCodes[1])).statusCode).toBe(200);
      const regenerated = await t.call(
        'POST',
        '/api/auth/two-factor/generate-backup-codes',
        { password: account.password },
        cookie,
      );
      expect(regenerated.statusCode).toBe(200);
      const fresh = regenerated.json().backupCodes as string[];
      expect(fresh).toHaveLength(10);
      expect((await useCode(backupCodes[2])).statusCode).toBe(401);
      expect((await useCode(fresh[0])).statusCode).toBe(200);
      expect(
        t
          .activity()
          .filter((e) => e.action === 'two-factor-codes-regenerate')
          .map((e) => e.result),
      ).toEqual(['failed', 'ok']);
    } finally {
      await t.done();
    }
  });

  it('applies both "stay signed in" choices after the second step', async () => {
    const t = await fresh();
    try {
      const { secret } = await t.enable(await t.session());
      const finish = async (rememberMe: boolean) => {
        const { challengeCookies } = await t.challenge(rememberMe);
        const verified = await t.call(
          'POST',
          '/api/auth/two-factor/verify-totp',
          { code: totp(secret) },
          challengeCookies,
        );
        expect(verified.statusCode).toBe(200);
        const header =
          ([] as string[])
            .concat(verified.headers['set-cookie'] as string[])
            .find((c) => c.startsWith('homora.session_token=')) ?? '';
        return { cookie: t.cookiesOf(verified).join('; '), header };
      };
      const ordinary = await finish(false);
      const remembered = await finish(true);
      expect(ordinary.header).not.toContain('Max-Age=');
      expect(remembered.header).toContain('Max-Age=2592000');
      const lifetimes = (await t.call('GET', '/api/account/sessions', undefined, ordinary.cookie))
        .json()
        .map((row: { current: boolean; createdAt: string; expiresAt: string }) => ({
          current: row.current,
          ms: Date.parse(row.expiresAt) - Date.parse(row.createdAt),
        }));
      const days = (ms: number) => Math.round(ms / 3_600_000);
      expect(lifetimes.find((row: { current: boolean }) => row.current).ms).toBeLessThan(
        8 * 3_600_000 + 5_000,
      );
      expect(
        lifetimes.map((row: { ms: number }) => days(row.ms)).sort((a: number, b: number) => a - b),
      ).toContain(720);
    } finally {
      await t.done();
    }
  });

  it('turns the second step off only with the password and ends other sessions', async () => {
    const t = await fresh();
    try {
      const { cookie, secret } = await t.enable(await t.session());
      const { challengeCookies } = await t.challenge();
      const other = t
        .cookiesOf(
          await t.call(
            'POST',
            '/api/auth/two-factor/verify-totp',
            { code: totp(secret) },
            challengeCookies,
          ),
        )
        .join('; ');
      const refused = await t.call(
        'POST',
        '/api/auth/two-factor/disable',
        { password: 'wrong-password' },
        cookie,
      );
      expect(refused.json().code).toBe('invalid-current-password');
      expect((await t.call('GET', '/api/account', undefined, cookie)).json().twoFactorEnabled).toBe(
        true,
      );
      const disabled = await t.call(
        'POST',
        '/api/auth/two-factor/disable',
        { password: account.password },
        cookie,
      );
      expect(disabled.statusCode).toBe(200);
      const after = t.cookiesOf(disabled).join('; ');
      expect((await t.call('GET', '/api/account', undefined, after)).json().twoFactorEnabled).toBe(
        false,
      );
      expect((await t.call('GET', '/api/services', undefined, other)).statusCode).toBe(401);
      expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM "twoFactor"').get()).toEqual({ n: 0 });
      expect((await t.signIn()).response.json().twoFactorRedirect).toBeUndefined();
      expect(
        t
          .activity()
          .filter((e) => e.action === 'two-factor-disable')
          .map((e) => e.result),
      ).toEqual(['failed', 'ok']);
    } finally {
      await t.done();
    }
  });

  it('keeps secrets, recovery codes and the setup URI out of storage, audit and later responses', async () => {
    const t = await fresh();
    try {
      const { secret, backupCodes, totpURI, cookie } = await t.enable(await t.session());
      const stored = JSON.stringify(
        t.sqlite.prepare('SELECT secret, backupCodes FROM "twoFactor"').all(),
      );
      expect(stored).not.toContain(secret);
      for (const code of backupCodes) expect(stored).not.toContain(code);
      const audit =
        JSON.stringify(t.activity()) +
        JSON.stringify((await t.call('GET', '/api/activity', undefined, cookie)).json());
      for (const sensitive of [secret, totpURI, account.password, ...backupCodes])
        expect(audit).not.toContain(sensitive);
      for (const url of ['/api/account', '/api/account/sessions', '/api/auth/get-session']) {
        const body = (await t.call('GET', url, undefined, cookie)).body;
        for (const sensitive of [secret, totpURI, ...backupCodes])
          expect(body, url).not.toContain(sensitive);
        expect(body, url).not.toContain('backupCodes');
      }
    } finally {
      await t.done();
    }
  });

  it('forwards only the routes the interface needs and never remembers a device', async () => {
    const t = await fresh();
    try {
      const { secret, cookie } = await t.enable(await t.session());
      for (const [method, url] of [
        ['POST', '/api/auth/two-factor/get-totp-uri'],
        ['POST', '/api/auth/two-factor/send-otp'],
        ['POST', '/api/auth/two-factor/verify-otp'],
        ['POST', '/api/auth/two-factor/view-backup-codes'],
        ['POST', '/api/auth/two-factor/generate-totp'],
      ] as const) {
        const response = await t.call(
          method,
          url,
          { password: account.password, userId: 'x' },
          cookie,
        );
        expect(response.statusCode, url).toBe(404);
      }
      const { challengeCookies } = await t.challenge();
      const verified = await t.call(
        'POST',
        '/api/auth/two-factor/verify-totp',
        { code: totp(secret), trustDevice: true },
        challengeCookies,
      );
      expect(verified.statusCode).toBe(200);
      expect(String(verified.headers['set-cookie'])).not.toContain('trust_device');
      // A second sign-in from the same browser still has to answer the challenge.
      const again = await t.call(
        'POST',
        '/api/auth/sign-in/email',
        { email: account.email, password: account.password },
        t.cookiesOf(verified).join('; '),
      );
      expect(again.json().twoFactorRedirect).toBe(true);
    } finally {
      await t.done();
    }
  });
});
