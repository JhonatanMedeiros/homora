import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { oidcProviderId } from './oidc-config.js';
import { account, claimsOf, closeAll, cookiesOf, fresh, open, pairsOf } from './test-oidc-app.js';
import { createMockIdp, IDP_CLIENT_ID, IDP_CLIENT_SECRET, type MockIdp } from './test-oidc.js';
import { createWeatherService } from './weather/service.js';

afterEach(async () => {
  vi.useRealTimers();
  await closeAll();
});

const password = account.password;
const providerOf = (idp: MockIdp, extra: object = {}) => ({
  password,
  issuer: idp.issuer,
  clientId: IDP_CLIENT_ID,
  clientSecret: IDP_CLIENT_SECRET,
  name: 'Saved IdP',
  ...extra,
});

/** An instance without variables, a signed-in administrator and a provider to configure. */
async function blank() {
  const idp = await createMockIdp();
  open.push(() => idp.close());
  const t = await fresh({ idp, config: null });
  const session = await t.signIn();
  const post = (path: string, payload: object, cookie = session) =>
    t.call('POST', `/api/account/oidc/${path}`, payload, cookie);
  const view = async () => (await t.call('GET', '/api/account/oidc', undefined, session)).json();
  const status = async () => (await t.call('GET', '/api/auth/status')).json().oidc;
  const rows = () => t.count("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'");
  return { ...t, session, post, view, status, rows };
}

/** Saved and linked. */
async function configured(extra: object = {}) {
  const t = await blank();
  expect((await t.post('config', providerOf(t.idp, extra))).statusCode).toBe(200);
  await t.link(t.session);
  return t;
}

const lifetime = (sqlite: Awaited<ReturnType<typeof blank>>['sqlite']) => {
  const row = sqlite.prepare('SELECT expiresAt FROM session ORDER BY rowid DESC LIMIT 1').get() as {
    expiresAt: string;
  };
  return (Date.parse(row.expiresAt) - Date.now()) / 3600_000;
};
const sessionCookie = (response: { headers: Record<string, unknown> }) =>
  cookiesOf(response).find((cookie) => cookie.startsWith('homora.session_token='))!;

describe('configuring the provider in the interface', () => {
  it('saves, tests and uses a provider without restarting, and keeps the secret unreadable', async () => {
    const t = await blank();
    expect(await t.view()).toMatchObject({ source: 'none', enabled: false, provider: null });
    const saved = await t.post('config', providerOf(t.idp));
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      source: 'saved',
      enabled: true,
      environment: false,
      provider: { issuer: t.idp.issuer, clientId: IDP_CLIENT_ID, name: 'Saved IdP' },
      redirectUri: `http://localhost:5173/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
      health: { status: 'ok' },
    });
    await t.link(t.session);
    expect(await t.status()).toMatchObject({ enabled: true, name: 'Saved IdP', linked: true });
    expect((await t.oidcSignIn()).back.headers.location).toBe('/');

    const row = JSON.stringify(t.sqlite.prepare('SELECT * FROM oidc_settings').all());
    for (const text of [IDP_CLIENT_SECRET, IDP_CLIENT_ID, t.idp.issuer])
      expect(row).not.toContain(text);
    const exposed = JSON.stringify([await t.view(), await t.status(), t.events(), t.lines]);
    expect(exposed).not.toContain(IDP_CLIENT_SECRET);
    expect(t.events().some((e) => e.action === 'oidc-config' && e.detail === 'save')).toBe(true);
  });

  it.each([
    ['config', { issuer: 'https://auth.example.test/' }],
    ['preferences', { disabled: true }],
    ['draft/discard', {}],
    ['remove', {}],
  ])('asks for a session and the password to change %s', async (path, payload) => {
    const t = await blank();
    expect((await t.post(path, { ...payload, password }, '')).statusCode).toBe(401);
    const wrong = await t.post(path, { ...payload, password: 'not-the-password' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('invalid-current-password');
    expect(t.count('SELECT COUNT(*) AS n FROM oidc_settings')).toBe(0);
    expect(t.events().some((e) => e.action === 'oidc-config' && e.result === 'failed')).toBe(true);
  });

  it('refuses an issuer that is not HTTPS and fields that are not plain text', async () => {
    const t = await blank();
    for (const issuer of ['http://auth.example.test/', 'https://a:b@auth.example.test/', 'nope']) {
      const response = await t.post('config', { password, issuer });
      expect(response.json().code).toBe('oidc-invalid-issuer');
    }
    for (const extra of [{ name: '<b>' }, { clientSecret: 'a\nb' }, { surprise: true }])
      expect((await t.post('config', providerOf(t.idp, extra))).statusCode).toBe(400);
    expect(t.count('SELECT COUNT(*) AS n FROM oidc_settings')).toBe(0);
  });

  it('saves a provider that fails the test but does not offer it', async () => {
    const t = await blank();
    t.idp.state.discovery = { id_token_signing_alg_values_supported: ['HS256'] };
    const saved = await t.post('config', providerOf(t.idp));
    expect(saved.json()).toMatchObject({
      source: 'saved',
      health: { status: 'failing', failure: 'signing' },
    });
    expect(await t.status()).toEqual({ enabled: false });
  });

  it.each([
    ['issuer', { issuer: 'https://someone-else.example.test/' }],
    ['endpoints', { token_endpoint: 'ftp://auth.example.test/token' }],
  ])('names a %s problem', async (failure, discovery) => {
    const t = await blank();
    t.idp.state.discovery = discovery;
    expect((await t.post('config', providerOf(t.idp))).json().health.failure).toBe(failure);
  });

  it('offers a failing provider again once it answers, without saving anything', async () => {
    const t = await blank();
    t.idp.state.down = true;
    await t.post('config', providerOf(t.idp));
    expect(await t.status()).toEqual({ enabled: false });
    t.idp.state.down = false;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
    await t.status();
    await vi.waitFor(async () => expect(await t.status()).toMatchObject({ enabled: true }));
  });

  describe('drafts', () => {
    it('keeps an incomplete provider aside and gives its redirect URL', async () => {
      const t = await blank();
      const saved = await t.post('config', { password, issuer: t.idp.issuer });
      expect(saved.json()).toMatchObject({
        source: 'none',
        enabled: false,
        draft: {
          issuer: t.idp.issuer,
          hasSecret: false,
          redirectUri: `http://localhost:5173/api/auth/callback/${oidcProviderId(t.idp.issuer)}`,
        },
      });
      expect(await t.status()).toEqual({ enabled: false });
      const completed = await t.post('config', providerOf(t.idp, { fromDraft: true }));
      expect(completed.json()).toMatchObject({ source: 'saved', draft: null });
    });

    it('never replaces the provider in use, and can be discarded', async () => {
      const t = await configured();
      const draft = await t.post('config', { password, issuer: 'https://next.example.test/' });
      expect(draft.json()).toMatchObject({
        provider: { issuer: t.idp.issuer },
        draft: { issuer: 'https://next.example.test/' },
      });
      expect((await t.oidcSignIn()).back.headers.location).toBe('/');
      expect((await t.post('draft/discard', { password })).json().draft).toBeNull();
    });
  });

  describe('the client secret', () => {
    it('is kept when only other fields change', async () => {
      const t = await configured();
      const saved = await t.post('config', {
        ...providerOf(t.idp, { name: 'Renamed' }),
        clientSecret: undefined,
      });
      expect(saved.json()).toMatchObject({ source: 'saved', provider: { name: 'Renamed' } });
      expect((await t.oidcSignIn()).back.headers.location).toBe('/');
    });

    it('is never carried to another issuer', async () => {
      const t = await configured();
      const saved = await t.post('config', {
        password,
        issuer: 'https://next.example.test/',
        clientId: IDP_CLIENT_ID,
      });
      expect(saved.json()).toMatchObject({
        provider: { issuer: t.idp.issuer },
        draft: { hasSecret: false },
      });
    });

    it('is not copied from the variables', async () => {
      const t = await fresh();
      const saved = await t.call(
        'POST',
        '/api/account/oidc/config',
        { password, issuer: t.idp.issuer, clientId: IDP_CLIENT_ID },
        await t.signIn(),
      );
      expect(saved.json()).toMatchObject({ source: 'environment', draft: { hasSecret: false } });
    });
  });

  describe('changing the issuer', () => {
    it('needs a confirmation, then removes the link and ends other sessions', async () => {
      const t = await configured();
      const other = await t.signIn();
      const next = await createMockIdp();
      open.push(() => next.close());
      const refused = await t.post('config', providerOf(next));
      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe('oidc-confirm-issuer');
      expect(t.rows()).toBe(1);
      expect((await t.view()).provider.issuer).toBe(t.idp.issuer);

      await t.post('preferences', { password, autoRedirect: true });
      const saved = await t.post('config', providerOf(next, { confirmIssuerChange: true }));
      expect(saved.json()).toMatchObject({
        identity: null,
        autoRedirect: false,
        provider: { issuer: next.issuer },
      });
      expect(t.rows()).toBe(0);
      expect((await t.call('GET', '/api/account', undefined, other)).statusCode).toBe(401);
      expect((await t.call('GET', '/api/account', undefined, t.session)).statusCode).toBe(200);
    });

    it('does not complete an attempt started with the previous provider', async () => {
      const t = await configured();
      const pending = await t.beginLogin();
      const path = t.idp.approve(pending.url, claimsOf('subject-1'));
      const next = await createMockIdp();
      open.push(() => next.close());
      await t.post('config', providerOf(next, { confirmIssuerChange: true }));
      const back = await t.call('GET', path, undefined, pending.cookie);
      expect(back.statusCode).toBe(404);
      expect(t.hasSession(back)).toBe(false);
      expect(t.count('SELECT COUNT(*) AS n FROM verification')).toBe(0);
    });

    it.each(['login', 'link'] as const)(
      'applies the change while a %s callback waits for the old provider, which then changes nothing',
      async (mode) => {
        const t = mode === 'login' ? await configured() : await blank();
        if (mode === 'link') await t.post('config', providerOf(t.idp));
        const pending = mode === 'login' ? await t.beginLogin() : await t.beginLink(t.session);
        let release = () => {};
        t.idp.state.tokenGate = new Promise<void>((resolve) => (release = resolve));
        const returning = t.callback(pending);
        await vi.waitFor(() => expect(t.idp.requests).toContain('/token'));
        const off = await t.post('preferences', { password, disabled: true });
        expect(off.statusCode).toBe(200);
        const sessions = t.count('SELECT COUNT(*) AS n FROM session');
        const links = t.rows();
        release();
        const back = await returning;
        expect(back.headers.location).toMatch(/error=failed$/);
        expect(t.hasSession(back)).toBe(false);
        expect(t.count('SELECT COUNT(*) AS n FROM session')).toBe(sessions);
        expect(t.rows()).toBe(links);
      },
    );
  });

  describe('disabling and removing', () => {
    it('keeps the configuration, the link and the sessions when disabled', async () => {
      const t = await configured();
      const other = await t.signIn();
      const off = await t.post('preferences', { password, disabled: true });
      expect(off.json()).toMatchObject({ enabled: false, source: 'saved' });
      expect(off.json().identity).toMatchObject({ current: true });
      expect(await t.status()).toEqual({ enabled: false });
      expect((await t.call('POST', '/api/auth/oidc/login', {})).statusCode).toBe(404);
      expect((await t.call('GET', '/api/account', undefined, other)).statusCode).toBe(200);
      await t.post('preferences', { password, disabled: false });
      expect((await t.oidcSignIn()).back.headers.location).toBe('/');
    });

    it('deletes the saved provider and the link, ending other sessions', async () => {
      const t = await configured();
      const other = await t.signIn();
      const removed = await t.post('remove', { password });
      expect(removed.json()).toMatchObject({ source: 'none', identity: null, provider: null });
      expect(t.rows()).toBe(0);
      expect(t.count('SELECT COUNT(*) AS n FROM oidc_settings')).toBe(0);
      expect((await t.call('GET', '/api/account', undefined, other)).statusCode).toBe(401);
      expect((await t.post('remove', { password })).statusCode).toBe(404);
    });

    it('changes nothing when the session is too old to remove the link', async () => {
      const t = await configured();
      t.sqlite
        .prepare('UPDATE session SET createdAt = ?')
        .run(new Date(Date.now() - 48 * 3600_000).toISOString());
      const refused = await t.post('remove', { password });
      expect(refused.json().code).toBe('session-not-fresh');
      expect(t.rows()).toBe(1);
      expect((await t.view()).source).toBe('saved');
    });
  });

  describe('variables and saved configuration', () => {
    it('prefers the saved provider and returns to the variables once removed', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const next = await createMockIdp();
      open.push(() => next.close());
      const saved = await t.call('POST', '/api/account/oidc/config', providerOf(next), session);
      expect(saved.json()).toMatchObject({
        source: 'saved',
        environment: true,
        provider: { issuer: next.issuer },
      });
      // The same database after a restart.
      const restarted = t.build(t.idp.config());
      const info = await restarted.app.inject({
        method: 'GET',
        url: '/api/account/oidc',
        headers: { cookie: session },
      });
      expect(info.json().provider.issuer).toBe(next.issuer);
      const removed = await t.call('POST', '/api/account/oidc/remove', { password }, session);
      expect(removed.json()).toMatchObject({
        source: 'environment',
        provider: { issuer: t.idp.issuer },
      });
    });

    it('changes preferences of a provider from the variables without its secret', async () => {
      const t = await fresh();
      const session = await t.signIn();
      const off = await t.call(
        'POST',
        '/api/account/oidc/preferences',
        { password, disabled: true },
        session,
      );
      expect(off.json()).toMatchObject({ source: 'environment', enabled: false });
      expect((await t.call('GET', '/api/auth/status')).json().oidc).toEqual({ enabled: false });
      expect(t.count('SELECT COUNT(*) AS n FROM oidc_settings WHERE provider IS NOT NULL')).toBe(0);
    });

    it('marks the link as old, without deleting it, when the variables change issuer', async () => {
      const t = await fresh();
      const session = await t.signIn();
      await t.link(session);
      const next = await createMockIdp();
      open.push(() => next.close());
      const { app } = t.build(next.config());
      const info = await app.inject({
        method: 'GET',
        url: '/api/account/oidc',
        headers: { cookie: session },
      });
      expect(info.json().identity).toMatchObject({ current: false });
      expect(t.count("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'")).toBe(1);
    });

    it('does not fall back to the variables when the saved provider cannot be read', async () => {
      const t = await fresh();
      t.sqlite
        .prepare("INSERT INTO oidc_settings (id, provider, preferences) VALUES (1, 'broken', '{}')")
        .run();
      const { app, auth } = t.build(t.idp.config());
      await app.ready();
      expect(auth.oidc).toBeUndefined();
      expect(t.lines.some((line) => line.includes('cannot be decrypted'))).toBe(true);
    });
  });

  describe('automatic redirect', () => {
    const auto = (t: Awaited<ReturnType<typeof blank>>) =>
      t.call('POST', '/api/auth/oidc/login', { auto: true });

    it('can only be turned on once a working provider is linked', async () => {
      const t = await blank();
      await t.post('config', providerOf(t.idp));
      const early = await t.post('preferences', { password, autoRedirect: true });
      expect(early.json().code).toBe('oidc-auto-unavailable');
      expect((await auto(t)).statusCode).toBe(409);
      await t.link(t.session);
      expect((await t.post('preferences', { password, autoRedirect: true })).statusCode).toBe(200);
      expect(await t.status()).toMatchObject({ autoRedirect: true });
      expect((await auto(t)).statusCode).toBe(200);
    });

    it('does not leave for a provider that stopped answering', async () => {
      const t = await configured();
      await t.post('preferences', { password, autoRedirect: true });
      t.idp.state.down = true;
      const response = await auto(t);
      expect(response.statusCode).toBe(503);
      expect(cookiesOf(response)).toHaveLength(0);
    });
  });

  describe('session length', () => {
    const signInWith = async (t: Awaited<ReturnType<typeof blank>>, body: object) => {
      const started = await t.call('POST', '/api/auth/oidc/login', body);
      return t.callback({
        url: started.json().url as string,
        cookie: pairsOf(started).join('; '),
      });
    };

    it('keeps eight hours unless "keep me signed in" was chosen', async () => {
      const t = await configured();
      const short = await signInWith(t, {});
      expect(sessionCookie(short)).not.toMatch(/Max-Age|Expires/i);
      expect(lifetime(t.sqlite)).toBeLessThanOrEqual(8);
      const long = await signInWith(t, { rememberMe: true });
      expect(long.headers.location).toBe('/');
      expect(sessionCookie(long)).toMatch(/Max-Age=2592000/i);
      expect(lifetime(t.sqlite)).toBeGreaterThan(29 * 24);
    });

    it('uses the saved preference for the automatic redirect, not the request', async () => {
      const t = await configured();
      await t.post('preferences', { password, autoRedirect: true });
      await signInWith(t, { auto: true, rememberMe: true });
      expect(lifetime(t.sqlite)).toBeLessThanOrEqual(8);
      await t.post('preferences', { password, longSession: true });
      await signInWith(t, { auto: true });
      expect(lifetime(t.sqlite)).toBeGreaterThan(29 * 24);
    });

    it('ignores a longer-session header sent by the client', async () => {
      const t = await configured();
      const start = await t.beginLogin();
      const path = t.idp.approve(start.url, claimsOf('subject-1'));
      await t.call('GET', path, undefined, start.cookie, { 'x-homora-remember-me': '1' });
      expect(lifetime(t.sqlite)).toBeLessThanOrEqual(8);
    });
  });

  describe('a provider that does not answer', () => {
    it('holds up neither sessions nor the password, and is asked again later', async () => {
      const idp = await createMockIdp();
      idp.state.stall = true;
      open.push(() => idp.close());
      const t = await fresh({ idp, providerReadyMs: 200 });
      const session = await t.signIn();
      expect(session).toContain('homora.session_token=');
      expect((await t.call('GET', '/api/services', undefined, session)).statusCode).toBe(200);
      expect((await t.call('GET', '/api/auth/status')).statusCode).toBe(200);
      expect((await t.beginLogin()).response.statusCode).toBe(503);
      idp.state.stall = false;
      expect((await t.beginLogin()).response.statusCode).toBe(200);
    });

    it('does not delay the callbacks of the provider that replaces it', async () => {
      const t = await configured();
      const pending = await t.beginLogin();
      let release = () => {};
      t.idp.state.tokenGate = new Promise<void>((resolve) => (release = resolve));
      const returning = t.callback(pending);
      await vi.waitFor(() => expect(t.idp.requests.at(-1)).toBe('/token'));
      const next = await createMockIdp();
      open.push(() => next.close());
      await t.post('config', providerOf(next, { confirmIssuerChange: true }));
      const start = await t.beginLink(t.session);
      const back = await t.call('GET', next.approve(start.url), undefined, start.cookie);
      expect(back.headers.location).toBe('/account?oidc=linked');
      release();
      await returning;
    });
  });

  // The library keeps the discovery document it first read, algorithms included.
  it.each(['test', 'config'])(
    'signs in once the provider is repaired and tried again (%s)',
    async (path) => {
      const t = await blank();
      t.idp.state.discovery = { id_token_signing_alg_values_supported: ['HS256'] };
      await t.post('config', providerOf(t.idp));
      expect((await t.link(t.session)).back.headers.location).toContain('error=failed');
      t.idp.state.discovery = {};
      await t.post(path, path === 'test' ? {} : providerOf(t.idp));
      expect((await t.link(t.session)).back.headers.location).toBe('/account?oidc=linked');
    },
  );

  it('keeps an attempt in progress valid across "test again"', async () => {
    const t = await configured();
    const pending = await t.beginLogin();
    await t.post('test', {});
    expect((await t.callback(pending)).headers.location).toBe('/');
  });

  it('notices a reset made on the command line while it runs', async () => {
    const t = await configured();
    t.sqlite.exec(`DELETE FROM account WHERE providerId LIKE 'oidc-%'; DELETE FROM oidc_settings`);
    expect(await t.status()).toEqual({ enabled: false });
    expect(t.auth.oidc).toBeUndefined();
  });

  it('uses a draft secret only when that draft is completed', async () => {
    const t = await configured();
    const draft = { password, issuer: t.idp.issuer, clientSecret: 'untested-secret' };
    await t.post('config', draft);
    const edit = { ...providerOf(t.idp), clientSecret: undefined };
    const renamed = await t.post('config', { ...edit, name: 'Renamed' });
    expect(renamed.json()).toMatchObject({ draft: { hasSecret: true } });
    expect((await t.oidcSignIn()).back.headers.location).toBe('/');
    const completed = await t.post('config', { ...edit, fromDraft: true });
    expect(completed.json().draft).toBeNull();
    expect((await t.oidcSignIn()).back.headers.location).toContain('error=failed');
  });

  describe('without the key', () => {
    it('removes nothing for a provider that could not be saved', async () => {
      const t = await configured();
      await rm(join(t.directory, 'homora.sqlite.key'));
      const refused = await t.post(
        'config',
        providerOf(t.idp, {
          issuer: 'https://next.example.test/',
          confirmIssuerChange: true,
        }),
      );
      expect(refused.json().code).toBe('oidc-unreadable');
      expect(t.rows()).toBe(1);
    });

    it('lets an unreadable draft be removed', async () => {
      const t = await blank();
      t.sqlite
        .prepare("INSERT INTO oidc_settings (id, draft, preferences) VALUES (1, 'broken', '{}')")
        .run();
      expect(await t.view()).toMatchObject({ unreadable: true, source: 'none' });
      expect((await t.post('remove', { password })).json()).toMatchObject({ unreadable: false });
    });

    it('is never replaced by another integration while the provider is sealed with it', async () => {
      const t = await configured();
      await rm(join(t.directory, 'homora.sqlite.key'));
      const weather = createWeatherService(t.sqlite, t.vault);
      expect(() => weather.setProviderApiKey('openweathermap', 'a'.repeat(32))).toThrow();
    });
  });
});
