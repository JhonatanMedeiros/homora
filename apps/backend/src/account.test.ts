import type { InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { createTestAuth, createTestSession, TEST_EMAIL, TEST_PASSWORD } from './test-auth.js';

const ORIGIN = 'http://localhost:5173';
const NEW_PASSWORD = 'another-password-1';

async function setup(sessionOnly = false) {
  const database = createDatabase(':memory:');
  const { auth, cookie } = sessionOnly ? createTestSession() : await createTestAuth(database.db);
  const app = createApp(database.db, 5173, auth);
  const call = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: InjectOptions['payload'],
    headers: Record<string, string> = { cookie },
  ) => app.inject({ method, url, payload, headers: { origin: ORIGIN, ...headers } });
  return { database, auth, app, cookie, call };
}

let open: Awaited<ReturnType<typeof setup>> | undefined;
afterEach(async () => {
  await open?.app.close();
  open?.database.close();
  open = undefined;
});

describe('account and activity API', () => {
  it('requires a session', async () => {
    open = await setup(true);
    for (const [method, url] of [
      ['GET', '/api/account'],
      ['GET', '/api/account/sessions'],
      ['GET', '/api/activity'],
    ] as const)
      expect((await open.call(method, url, undefined, {})).statusCode).toBe(401);
  });

  it('shows and renames the profile', async () => {
    open = await setup();
    expect((await open.call('GET', '/api/account')).json()).toEqual({
      name: 'Administrator',
      email: TEST_EMAIL,
      twoFactorEnabled: false,
    });
    expect((await open.call('PATCH', '/api/account', { name: '  Ana Lima ' })).json().name).toBe(
      'Ana Lima',
    );
    expect((await open.call('PATCH', '/api/account', { name: '' })).statusCode).toBe(400);
    expect((await open.call('PATCH', '/api/account', { email: 'x@y.test' })).statusCode).toBe(400);
  });

  it('lists sessions without tokens and ends another one', async () => {
    open = await setup();
    const other = await open.auth.createSessionCookie(TEST_EMAIL, TEST_PASSWORD);
    const list = (await open.call('GET', '/api/account/sessions')).json();
    expect(list).toHaveLength(2);
    expect(list.filter((row: { current: boolean }) => row.current)).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('token');
    const target = list.find((row: { current: boolean }) => !row.current);
    const own = list.find((row: { current: boolean }) => row.current);
    expect((await open.call('POST', `/api/account/sessions/${own.id}/revoke`)).statusCode).toBe(
      404,
    );
    expect((await open.call('POST', '/api/account/sessions/nope/revoke')).statusCode).toBe(404);
    expect((await open.call('POST', `/api/account/sessions/${target.id}/revoke`)).statusCode).toBe(
      200,
    );
    expect((await open.call('GET', '/api/account', undefined, { cookie: other })).statusCode).toBe(
      401,
    );
    expect((await open.call('GET', '/api/account')).statusCode).toBe(200);
  });

  it('changes the password, keeps this session and can end the others', async () => {
    open = await setup();
    const other = await open.auth.createSessionCookie(TEST_EMAIL, TEST_PASSWORD);
    const wrong = await open.call('POST', '/api/account/password', {
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('invalid-current-password');
    expect(
      (
        await open.call('POST', '/api/account/password', {
          currentPassword: TEST_PASSWORD,
          newPassword: 'short',
        })
      ).statusCode,
    ).toBe(400);
    const ok = await open.call('POST', '/api/account/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(ok.statusCode).toBe(200);
    expect((await open.call('GET', '/api/account')).statusCode).toBe(200);
    expect((await open.call('GET', '/api/account', undefined, { cookie: other })).statusCode).toBe(
      401,
    );
    await expect(open.auth.createSessionCookie(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();
    await expect(open.auth.createSessionCookie(TEST_EMAIL, NEW_PASSWORD)).resolves.toContain('=');
  });

  it('keeps other sessions when asked and throttles password guesses', async () => {
    open = await setup();
    const other = await open.auth.createSessionCookie(TEST_EMAIL, TEST_PASSWORD);
    await open.call('POST', '/api/account/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOthers: false,
    });
    expect((await open.call('GET', '/api/account', undefined, { cookie: other })).statusCode).toBe(
      200,
    );
    expect((await open.call('POST', '/api/account/sessions/revoke-others')).statusCode).toBe(200);
    expect((await open.call('GET', '/api/account', undefined, { cookie: other })).statusCode).toBe(
      401,
    );
    let last = 0;
    // Ten guesses are allowed; the eleventh verifies that the account-level limit trips.
    for (let i = 0; i < 11; i++)
      last = (
        await open.call('POST', '/api/account/password', {
          currentPassword: 'wrong-password',
          newPassword: NEW_PASSWORD,
        })
      ).statusCode;
    expect(last).toBe(429);
  });

  it('records the activity feed without the typed e-mail or password', async () => {
    open = await setup();
    const ua = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' };
    const bad = await open.call(
      'POST',
      '/api/auth/sign-in/email',
      { email: 'typed-by-mistake@homora.test', password: 'hunter2-hunter2' },
      ua,
    );
    expect(bad.statusCode).toBe(401);
    const good = await open.call(
      'POST',
      '/api/auth/sign-in/email',
      { email: TEST_EMAIL, password: TEST_PASSWORD },
      ua,
    );
    expect(good.statusCode).toBe(200);
    await open.call('POST', '/api/account/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    await open.call('POST', '/api/agents', { name: 'claude-desktop', scopes: ['services:read'] });
    const feed = (await open.call('GET', '/api/activity')).json();
    const raw = JSON.stringify(feed);
    expect(raw).not.toContain('typed-by-mistake');
    expect(raw).not.toContain('hunter2');
    const actions = feed.events.map((e: { action: string; outcome: string }) => [
      e.action,
      e.outcome,
    ]);
    expect(actions).toEqual([
      ['agent-issue', 'success'],
      ['password-change', 'success'],
      ['login', 'success'],
      ['login', 'failure'],
    ]);
    expect(feed.events[2].detail).toBe('Chrome · Linux');
    expect(feed.events[2].actor).toEqual({ type: 'user', name: 'Administrator' });
    expect(feed.events[3].actor.type).toBe('anonymous');
    expect(feed.events[3].detail).toBe('1');
    const failures = (await open.call('GET', '/api/activity?outcome=failure')).json();
    expect(failures.events).toHaveLength(1);
    const agents = (await open.call('GET', '/api/activity?kind=agent&limit=1')).json();
    expect(agents.events[0]).toMatchObject({ action: 'agent-issue', detail: 'claude-desktop' });
    const page = (await open.call('GET', '/api/activity?limit=2')).json();
    expect(page.nextBefore).toBe(page.events[1].id);
    expect((await open.call('GET', '/api/activity?kind=nope')).statusCode).toBe(400);
  });
  it('never leaks tokens or passwords into the activity feed', async () => {
    open = await setup();
    const issued = (
      await open.call('POST', '/api/agents', { name: 'ci-bot', scopes: ['services:read'] })
    ).json();
    const agentId = issued.id ?? issued.agent?.id;
    await open.call('POST', `/api/agents/${agentId}/rotate`);
    await open.call('POST', '/api/account/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    const secrets = [issued.token, TEST_PASSWORD, NEW_PASSWORD].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    expect(secrets.length).toBeGreaterThanOrEqual(3);
    const raw = JSON.stringify((await open.call('GET', '/api/activity?limit=100')).json());
    for (const secret of secrets) expect(raw).not.toContain(secret);
  });

  it('combines filters and rejects invalid cursors and limits', async () => {
    open = await setup(true);
    await open.call('POST', '/api/agents', { name: 'one', scopes: ['services:read'] });
    const combined = (await open.call('GET', '/api/activity?kind=agent&outcome=success')).json();
    expect(combined.events).toHaveLength(1);
    const none = (await open.call('GET', '/api/activity?kind=agent&outcome=failure')).json();
    expect(none.events).toEqual([]);
    for (const query of ['limit=0', 'limit=101', 'before=-1', 'before=abc', 'outcome=ok'])
      expect((await open.call('GET', `/api/activity?${query}`)).statusCode).toBe(400);
  });
});
