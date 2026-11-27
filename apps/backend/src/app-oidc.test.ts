import { afterEach, describe, expect, it } from 'vitest';
import { oidcProviderId } from './oidc-config.js';
import { account, claimsOf, closeAll, cookiesOf, fresh, open, pairsOf } from './test-oidc-app.js';
import { createMockIdp, IDP_CLIENT_SECRET } from './test-oidc.js';

afterEach(closeAll);

describe('OIDC sign-in', () => {
  it('stays off without configuration and keeps the local sign-in working', async () => {
    const t = await fresh({ config: null });
    expect((await t.call('GET', '/api/auth/status')).json().oidc).toEqual({ enabled: false });
    expect((await t.call('POST', '/api/auth/oidc/login', {})).statusCode).toBe(404);
    expect((await t.call('POST', '/api/auth/oidc/link', { password: 'x' })).statusCode).toBe(404);
    expect(
      (await t.call('GET', '/api/auth/callback/oidc-anything?code=a&state=b')).statusCode,
    ).toBe(404);
    expect((await t.call('GET', '/api/account', undefined, await t.signIn())).statusCode).toBe(200);
    expect(t.idp.requests).toHaveLength(0);
  });

  it('tells the sign-in page only the label and whether an identity is linked', async () => {
    const t = await fresh();
    const status = (await t.call('GET', '/api/auth/status')).json();
    expect(status.oidc).toEqual({
      enabled: true,
      name: 'Test IdP',
      linked: false,
      autoRedirect: false,
    });
    expect(JSON.stringify(status)).not.toContain(IDP_CLIENT_SECRET);
    expect(JSON.stringify(status)).not.toContain('127.0.0.1');
  });

  describe('linking', () => {
    it('links an identity explicitly and then signs in with it', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const { back } = await t.link(session);
      expect(back.statusCode).toBe(302);
      expect(back.headers.location).toBe('/account?oidc=linked');
      expect(t.hasSession(back)).toBe(false);
      expect((await t.call('GET', '/api/auth/status')).json().oidc.linked).toBe(true);
      const info = (await t.call('GET', '/api/account/oidc', undefined, session)).json();
      expect(info).toMatchObject({ enabled: true, name: 'Test IdP', identity: { current: true } });
      expect(info.redirectUri).toBe(
        `http://localhost:5173/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
      );
      expect(JSON.stringify(info)).not.toContain('subject-1');

      const signed = await t.oidcSignIn();
      expect(signed.back.statusCode).toBe(302);
      expect(signed.back.headers.location).toBe('/');
      expect((await t.call('GET', '/api/account', undefined, signed.session)).statusCode).toBe(200);
      const log = t.events();
      expect(log.some((e) => e.action === 'oidc-link' && e.result === 'ok')).toBe(true);
      expect(
        log.some((e) => e.action === 'login' && e.result === 'ok' && e.detail?.startsWith('OIDC')),
      ).toBe(true);
      expect(t.count('SELECT COUNT(*) AS n FROM "user"')).toBe(1);
    });

    it('needs a session, the password, and links only one identity', async () => {
      const t = await fresh();
      expect(
        (await t.call('POST', '/api/auth/oidc/link', { password: account.password })).statusCode,
      ).toBe(401);
      const session = await t.signIn();
      const wrong = await t.beginLink(session, 'not-the-password');
      expect(wrong.response.statusCode).toBe(400);
      expect(wrong.response.json().code).toBe('invalid-current-password');
      expect(t.events().some((e) => e.action === 'oidc-link' && e.result === 'failed')).toBe(true);
      await t.link(session);
      const again = await t.beginLink(session);
      expect(again.response.statusCode).toBe(409);
      expect(again.response.json().code).toBe('oidc-already-linked');
    });

    it('refuses to start from an address other than the configured one', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const other = { origin: 'http://127.0.0.1:5173' };
      const link = await t.call(
        'POST',
        '/api/auth/oidc/link',
        { password: account.password },
        session,
        other,
      );
      expect(link.json().code).toBe('oidc-wrong-origin');
      expect((await t.call('POST', '/api/auth/oidc/login', {}, undefined, other)).json().code).toBe(
        'oidc-wrong-origin',
      );
    });

    it('does not link when the provider answers for someone who was not signed in at the start', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const start = await t.beginLink(session);
      // The attempt's cookie is missing (another browser): nothing is linked.
      const back = await t.callback(start, claimsOf('subject-1'), (p) => p, '');
      expect(back.headers.location).toMatch(/^\/(login|account)\?error=failed$/);
      expect((await t.call('GET', '/api/auth/status')).json().oidc.linked).toBe(false);
    });
  });

  describe('signing in', () => {
    async function linked() {
      const t = await fresh();
      const session = await t.signIn();
      await t.link(session);
      return { t, session };
    }

    it('asks the provider with PKCE, state and nonce, and keeps only the state cookie cross-site', async () => {
      const { t } = await linked();
      const { url, response } = await t.beginLogin();
      const parsed = new URL(url);
      expect(parsed.origin).toBe(new URL(t.idp.issuer).origin);
      expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
        response_type: 'code',
        client_id: 'homora-client',
        redirect_uri: `http://localhost:5173/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
        code_challenge_method: 'S256',
      });
      expect(parsed.searchParams.get('scope')).toContain('openid');
      for (const name of ['state', 'nonce', 'code_challenge'])
        expect(parsed.searchParams.get(name)!.length).toBeGreaterThanOrEqual(30);
      const state = cookiesOf(response).find((cookie) => cookie.includes('state'))!;
      expect(state).toMatch(/HttpOnly/i);
      expect(state).toMatch(/SameSite=Lax/i);
      expect(state).not.toMatch(/Secure/i);
    });

    it('opens a strict, browser-only session of eight hours', async () => {
      const { t } = await linked();
      const result = await t.oidcSignIn();
      const cookie = cookiesOf(result.back).find((c) => c.startsWith('homora.session_token='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
      const sessions = (
        await t.call('GET', '/api/account/sessions', undefined, result.session)
      ).json() as {
        expiresAt: string;
        current: boolean;
      }[];
      const left = Date.parse(sessions.find((s) => s.current)!.expiresAt) - Date.now();
      expect(left).toBeGreaterThan(7.9 * 3600_000);
      expect(left).toBeLessThanOrEqual(8 * 3600_000);
    });

    it('stores no token from the provider and exposes no secret', async () => {
      const { t, session } = await linked();
      await t.oidcSignIn();
      const row = t.sqlite
        .prepare(
          "SELECT accessToken, refreshToken, idToken FROM account WHERE providerId LIKE 'oidc-%'",
        )
        .get();
      expect(row).toEqual({ accessToken: null, refreshToken: null, idToken: null });
      const dump = JSON.stringify([
        t.events(),
        (await t.call('GET', '/api/account/oidc', undefined, session)).json(),
        (await t.call('GET', '/api/auth/status')).json(),
      ]);
      for (const secret of [
        IDP_CLIENT_SECRET,
        'access-token-never-stored',
        'refresh-token-never-stored',
        'subject-1',
      ])
        expect(dump).not.toContain(secret);
    });

    it.each([
      ['an unknown subject', claimsOf('someone-else')],
      [
        'an unknown subject using the administrator’s e-mail',
        { sub: 'intruder', email: account.email, email_verified: true },
      ],
    ])('refuses %s and creates no account or link', async (_name, claims) => {
      const { t } = await linked();
      const result = await t.oidcSignIn(claims);
      expect(result.back.headers.location).toBe('/login?error=failed');
      expect(t.hasSession(result.back)).toBe(false);
      expect(t.count('SELECT COUNT(*) AS n FROM "user"')).toBe(1);
      expect(t.count("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'")).toBe(1);
      const failed = t.events().filter((e) => e.action === 'login' && e.result === 'failed');
      expect(failed).toHaveLength(1);
      expect(failed[0]!.detail).toBe('OIDC · 1');
    });

    it('refuses an unlinked identity even when its e-mail matches and the provider says it is verified', async () => {
      const t = await fresh();
      // Nothing linked yet: a matching, verified e-mail must not link or sign in implicitly.
      const result = await t.oidcSignIn({
        sub: 'first-contact',
        email: account.email,
        email_verified: true,
      });
      expect(result.back.headers.location).toBe('/login?error=failed');
      expect(t.hasSession(result.back)).toBe(false);
      expect(t.count("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'")).toBe(0);
    });

    const now = Math.floor(Date.now() / 1000);
    it.each([
      ['wrong issuer', claimsOf('subject-1', { iss: 'https://evil.example.test/' })],
      ['wrong audience', claimsOf('subject-1', { aud: 'someone-elses-client' })],
      ['expired token', claimsOf('subject-1', { exp: now - 3600, iat: now - 7200 })],
      ['wrong nonce', claimsOf('subject-1', { nonce: 'replayed-from-another-attempt' })],
    ])('refuses an ID token with a %s', async (_name, claims) => {
      const { t } = await linked();
      const result = await t.oidcSignIn(claims);
      expect(result.back.headers.location).toBe('/login?error=failed');
      expect(t.hasSession(result.back)).toBe(false);
    });

    it('refuses an ID token signed with a key the provider does not publish', async () => {
      const { t } = await linked();
      t.idp.state.signingKey = await t.idp.foreignKey();
      const result = await t.oidcSignIn();
      expect(result.back.headers.location).toBe('/login?error=failed');
    });

    it('refuses callbacks that were forged, repeated, or lost their state cookie', async () => {
      const { t } = await linked();
      const failed = (response: { headers: Record<string, unknown> }) =>
        expect(String(response.headers.location)).toMatch(/error=/);

      const start = await t.beginLogin();
      const path = t.idp.approve(start.url, claimsOf('subject-1'));
      failed(await t.call('GET', path)); // another browser: no cookie
      const ok = await t.call('GET', path, undefined, start.cookie);
      expect(ok.headers.location).toBe('/');
      const replay = await t.call('GET', path, undefined, start.cookie);
      // A replay lands on the sign-in page, never on the library's own error route.
      expect(replay.headers.location).toBe('/login?error=failed');

      const second = await t.beginLogin();
      failed(
        await t.callback(second, claimsOf('subject-1'), (p) =>
          p.replace(/state=([^&]+)/, 'state=forged'),
        ),
      );
      const third = await t.beginLogin();
      failed(
        await t.callback(third, claimsOf('subject-1'), (p) =>
          p.replace(/code=([^&]+)/, 'code=forged'),
        ),
      );
      const fourth = await t.beginLogin();
      const stolen = t.idp.approve(fourth.url, claimsOf('subject-1'));
      failed(await t.call('GET', stolen, undefined, (await t.beginLogin()).cookie)); // someone else's cookie
      failed(await t.call('GET', `/api/auth/callback/${t.auth.oidc!.providerId}`));
    });

    it('reports a refusal at the provider without echoing its text', async () => {
      const { t } = await linked();
      const start = await t.beginLogin();
      const state = new URL(start.url).searchParams.get('state');
      const path = `/api/auth/callback/${t.auth.oidc!.providerId}?error=access_denied&error_description=${encodeURIComponent('<script>alert(1)</script>')}&state=${state}`;
      const back = await t.call('GET', path, undefined, start.cookie);
      expect(back.headers.location).toBe('/login?error=denied');
    });

    it('does not ask for the authenticator code: the provider is the second factor', async () => {
      const { t } = await linked();
      t.sqlite.prepare('UPDATE "user" SET twoFactorEnabled = 1').run();
      const result = await t.oidcSignIn();
      expect(result.back.headers.location).toBe('/');
      expect((await t.call('GET', '/api/account', undefined, result.session)).statusCode).toBe(200);
    });
  });

  describe('unavailable or misbehaving provider', () => {
    it('never signs in on userinfo claims when the ID token is missing', async () => {
      const t = await fresh();
      await t.link(await t.signIn());
      t.idp.state.withoutIdToken = true;
      const result = await t.oidcSignIn();
      expect(result.back.headers.location).toBe('/login?error=failed');
      expect(t.hasSession(result.back)).toBe(false);
      expect(t.idp.requests).not.toContain('/userinfo');
    });

    it('does not start when discovery reports another issuer', async () => {
      const idp = await createMockIdp();
      idp.state.discovery = { issuer: 'https://someone-else.example.test/' };
      open.push(() => idp.close());
      const t = await fresh({ idp });
      const response = await t.call('POST', '/api/auth/oidc/login', {});
      expect(response.statusCode).toBe(503);
      expect(cookiesOf(response)).toHaveLength(0);
    });

    it('answers 503 for OIDC, keeps the password sign-in and recovers when the provider is back', async () => {
      const idp = await createMockIdp();
      idp.state.down = true;
      const t = await fresh({ idp });
      const response = await t.call('POST', '/api/auth/oidc/login', {});
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('oidc-unavailable');
      expect(JSON.stringify(response.json())).not.toContain('127.0.0.1');
      expect(await t.signIn()).toContain('homora.session_token=');
      idp.state.down = false;
      expect((await t.call('POST', '/api/auth/oidc/login', {})).statusCode).toBe(200);
      await idp.close();
    });

    it('treats a rejected code exchange as a failed sign-in', async () => {
      const t = await fresh();
      await t.link(await t.signIn());
      t.idp.state.tokenStatus = 400;
      const result = await t.oidcSignIn();
      expect(result.back.headers.location).toBe('/login?error=failed');
    });
  });

  describe('diagnosing the provider', () => {
    const hmacOnly = { id_token_signing_alg_values_supported: ['HS256'] };
    const signingWarnings = (lines: string[]) =>
      lines.filter((line) => line.includes('signing key'));

    const health = async (t: Awaited<ReturnType<typeof fresh>>) =>
      (await t.call('POST', '/api/account/oidc/test', {}, await t.signIn())).json().health;

    it('says in the log that an HMAC-only provider cannot work, once', async () => {
      const idp = await createMockIdp();
      idp.state.discovery = hmacOnly;
      open.push(() => idp.close());
      const t = await fresh({ idp });
      expect(await health(t)).toMatchObject({ status: 'failing', failure: 'signing' });
      await health(t);
      expect(signingWarnings(t.lines)).toHaveLength(1);
      // The button is not offered for a provider that cannot work.
      expect((await t.call('GET', '/api/auth/status')).json().oidc).toEqual({ enabled: false });
    });

    it('notices it after a provider that was down at startup comes back', async () => {
      const idp = await createMockIdp();
      idp.state.discovery = hmacOnly;
      idp.state.down = true;
      open.push(() => idp.close());
      const t = await fresh({ idp });
      expect(await health(t)).toMatchObject({ status: 'failing', failure: 'unreachable' });
      expect(signingWarnings(t.lines)).toHaveLength(0);
      idp.state.down = false;
      expect(await health(t)).toMatchObject({ failure: 'signing' });
      expect(signingWarnings(t.lines)).toHaveLength(1);
    });

    it.each([[['RS256']], [['HS256', 'RS256']]])('stays quiet for %j', async (algorithms) => {
      const idp = await createMockIdp();
      idp.state.discovery = { id_token_signing_alg_values_supported: algorithms };
      open.push(() => idp.close());
      const t = await fresh({ idp });
      expect(await health(t)).toMatchObject({ status: 'ok', failure: null });
      expect(signingWarnings(t.lines)).toHaveLength(0);
    });
  });

  describe('changing or removing the link', () => {
    it('links only one identity even when two attempts return together', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const first = await t.beginLink(session);
      const second = await t.beginLink(session);
      const [a, b] = await Promise.all([
        t.callback(first, claimsOf('subject-1')),
        t.callback(second, claimsOf('subject-2')),
      ]);
      expect([a.headers.location, b.headers.location].sort()).toEqual([
        '/account?error=failed',
        '/account?oidc=linked',
      ]);
      expect(t.auth.oidcLinks.list()).toHaveLength(1);
    });

    it('removes every identity and any attempt that could link again', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const pending = await t.beginLink(session);
      await t.link(session);
      // A database that already holds a second identity.
      t.sqlite.exec(
        "INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) SELECT 'extra', 'subject-9', providerId, userId, createdAt, updatedAt FROM account WHERE providerId LIKE 'oidc-%'",
      );
      const removed = await t.call(
        'POST',
        '/api/account/oidc/unlink',
        { password: account.password },
        session,
      );
      expect(removed.statusCode).toBe(200);
      expect(t.auth.oidcLinks.list()).toHaveLength(0);
      const late = await t.callback(pending, claimsOf('subject-2'));
      expect(String(late.headers.location)).toContain('error=');
      expect(t.auth.oidcLinks.list()).toHaveLength(0);
    });

    it('still shows and removes the link after OIDC is switched off', async () => {
      const first = await fresh();
      const session = await first.signIn();
      await first.link(session);
      const { app } = first.build(undefined);
      const headers = { origin: 'http://localhost:5173', cookie: session };
      const info = await app.inject({ method: 'GET', url: '/api/account/oidc', headers });
      expect(info.json()).toMatchObject({ enabled: false, identity: { current: false } });
      const removed = await app.inject({
        method: 'POST',
        url: '/api/account/oidc/unlink',
        headers,
        payload: { password: account.password },
      });
      expect(removed.statusCode).toBe(200);
      expect(first.auth.oidcLinks.list()).toHaveLength(0);
    });

    it('unlinks with the password, ends other sessions and closes the OIDC entrance', async () => {
      const t = await fresh();
      const session = await t.signIn();
      await t.link(session);
      const other = await t.signIn();
      const wrong = await t.call(
        'POST',
        '/api/account/oidc/unlink',
        { password: 'nope-nope-nope' },
        session,
      );
      expect(wrong.statusCode).toBe(400);
      const removed = await t.call(
        'POST',
        '/api/account/oidc/unlink',
        { password: account.password },
        session,
      );
      expect(removed.statusCode).toBe(200);
      expect((await t.call('GET', '/api/account', undefined, other)).statusCode).toBe(401);
      expect((await t.call('GET', '/api/account', undefined, session)).statusCode).toBe(200);
      expect((await t.call('GET', '/api/auth/status')).json().oidc.linked).toBe(false);
      expect((await t.oidcSignIn()).back.headers.location).toBe('/login?error=failed');
      expect(
        (await t.call('POST', '/api/account/oidc/unlink', { password: account.password }, session))
          .statusCode,
      ).toBe(404);
      const log = t.events();
      expect(log.some((e) => e.action === 'oidc-unlink' && e.result === 'ok')).toBe(true);
      expect(log.some((e) => e.action === 'oidc-unlink' && e.result === 'failed')).toBe(true);
    });

    it('does not accept a link made for another provider after the configuration changed', async () => {
      const first = await fresh();
      const session = await first.signIn();
      await first.link(session);
      // Same database, another issuer, the same subject: the old link stays but never opens the account.
      const other = await createMockIdp();
      open.push(() => other.close());
      const config = other.config();
      const { app, auth } = first.build(config);
      expect(auth.oidc!.providerId).not.toBe(first.auth.oidc!.providerId);
      const headers = { origin: config.redirectOrigin };
      const status = await app.inject({ method: 'GET', url: '/api/auth/status', headers });
      expect(status.json().oidc).toMatchObject({ enabled: true, linked: false });
      const info = await app.inject({
        method: 'GET',
        url: '/api/account/oidc',
        headers: { ...headers, cookie: session },
      });
      expect(info.json().identity).toMatchObject({ current: false });
      const started = await app.inject({
        method: 'POST',
        url: '/api/auth/oidc/login',
        headers,
        payload: {},
      });
      const cookie = pairsOf(started).join('; ');
      const back = await app.inject({
        method: 'GET',
        url: other.approve(started.json().url, claimsOf('subject-1')),
        headers: { ...headers, cookie },
      });
      expect(back.headers.location).toBe('/login?error=failed');
      expect(first.count('SELECT COUNT(*) AS n FROM "user"')).toBe(1);
    });

    it('removes the identity with the account (cascade)', async () => {
      const t = await fresh();
      await t.link(await t.signIn());
      t.sqlite.exec('PRAGMA foreign_keys = ON');
      t.sqlite.prepare('DELETE FROM "user"').run();
      expect(t.count("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'")).toBe(0);
    });
  });

  describe('exposure', () => {
    it('keeps every other Better Auth route closed', async () => {
      const t = await fresh();
      const session = await t.signIn();
      for (const path of [
        '/api/auth/sign-in/social',
        '/api/auth/sign-in/oauth2',
        '/api/auth/link-social',
        '/api/auth/oauth2/link',
        '/api/auth/oauth2/callback/x',
        '/api/auth/list-accounts',
        '/api/auth/unlink-account',
        '/api/auth/account-info',
        '/api/auth/get-access-token',
        '/api/auth/refresh-token',
        '/api/auth/callback/some-other-provider',
      ]) {
        expect((await t.call('GET', path, undefined, session)).statusCode).toBe(404);
        expect(
          (await t.call('POST', path, { provider: t.auth.oidc!.providerId }, session)).statusCode,
        ).toBe(404);
      }
    });

    it('does not trust forwarded headers for the redirect URI', async () => {
      const t = await fresh();
      const { url } = await t.beginLogin({
        'x-forwarded-host': 'evil.example.test',
        'x-forwarded-proto': 'https',
        host: 'evil.example.test',
      });
      expect(new URL(url).searchParams.get('redirect_uri')).toBe(
        `http://localhost:5173/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
      );
    });

    it('requires an allowed origin for every state-changing request', async () => {
      const t = await fresh();
      for (const path of [
        '/api/auth/oidc/login',
        '/api/auth/oidc/link',
        '/api/account/oidc/unlink',
      ])
        expect(
          (await t.call('POST', path, {}, undefined, { origin: 'https://evil.example.test' }))
            .statusCode,
        ).toBe(403);
    });

    it('limits how often attempts can start', async () => {
      const t = await fresh();
      const codes: number[] = [];
      for (let i = 0; i < 11; i++)
        codes.push((await t.call('POST', '/api/auth/oidc/login', {})).statusCode);
      expect(codes.slice(0, 10).every((code) => code === 200)).toBe(true);
      expect(codes[10]).toBe(429);
    });

    it('marks the cookies Secure and the redirect HTTPS behind the HTTPS origin', async () => {
      const t = await fresh({
        config: { redirectOrigin: 'https://homora.example.test' },
        allowedOrigins: ['https://homora.example.test'],
      });
      const start = await t.call('POST', '/api/auth/oidc/login', {});
      expect(cookiesOf(start).every((cookie) => /; Secure/i.test(cookie))).toBe(true);
      expect(new URL(start.json().url).searchParams.get('redirect_uri')).toBe(
        `https://homora.example.test/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
      );
      await t.link(await t.signIn());
      const signed = await t.oidcSignIn();
      expect(cookiesOf(signed.back).find((c) => c.startsWith('homora.session_token='))).toMatch(
        /; Secure/i,
      );
    });
  });

  it('keeps the account and password working after linking', async () => {
    const t = await fresh();
    await t.link(await t.signIn());
    expect(await t.signIn()).toContain('homora.session_token=');
    expect(t.count('SELECT COUNT(*) AS n FROM "user"')).toBe(1);
  });
});
