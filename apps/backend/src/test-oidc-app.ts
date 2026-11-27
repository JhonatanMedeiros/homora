import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createLogger } from './logger.js';
import type { OidcConfig } from './oidc-config.js';
import { createMockIdp, type MockIdp } from './test-oidc.js';
import { createVault } from './vault.js';

export const account = {
  name: 'Administrator',
  email: 'admin@homora.test',
  password: 'super-secure-password',
};
export const claimsOf = (
  sub: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sub,
  email: 'idp@example.test',
  ...extra,
});

export const cookiesOf = (response: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((response.headers['set-cookie'] as string | string[] | undefined) ?? []);
export const pairsOf = (response: { headers: Record<string, unknown> }) =>
  cookiesOf(response)
    .map((cookie) => cookie.split(';')[0]!)
    .filter((pair) => !pair.endsWith('='));

/** What `fresh` opened; `closeAll` releases it after each test. */
export const open: (() => Promise<void>)[] = [];
export async function closeAll() {
  for (const close of open.splice(0)) await close();
}

type Options = {
  config?: Partial<OidcConfig> | null;
  allowedOrigins?: string[];
  idp?: MockIdp;
  providerReadyMs?: number;
  sqlite?: ReturnType<typeof getSqliteHandle>;
};

export async function fresh(options: Options = {}) {
  const idp = options.idp ?? (await createMockIdp());
  const allowedOrigins = options.allowedOrigins ?? [];
  const config = options.config === null ? undefined : idp.config(options.config);
  const db = createDatabase(':memory:');
  const sqlite = getSqliteHandle(db.db);
  /** Every line the application logs. */
  const lines: string[] = [];
  const logger = createLogger({ level: 'warn', stream: { write: (line) => lines.push(line) } });
  const directory = await mkdtemp(join(tmpdir(), 'homora-oidc-'));
  const vault = createVault(join(directory, 'homora.sqlite'));
  const build = (oidc: OidcConfig | undefined) => {
    const auth = createAuth({
      sqlite,
      secret: 'x'.repeat(48),
      webPort: 5173,
      allowedOrigins,
      oidc,
      providerReadyMs: options.providerReadyMs,
    });
    const app = createApp(db.db, 5173, auth, vault, allowedOrigins, undefined, {
      oidc,
      oidcAllowLoopbackHttp: true,
      logger,
    });
    open.push(() => app.close());
    return { auth, app };
  };
  const { auth, app } = build(config);
  open.push(async () => {
    db.close();
    await rm(directory, { recursive: true, force: true });
    if (!options.idp) await idp.close();
  });
  const origin = config?.redirectOrigin ?? 'http://localhost:5173';
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
  const signIn = async () =>
    pairsOf(
      await call('POST', '/api/auth/sign-in/email', {
        email: account.email,
        password: account.password,
        rememberMe: false,
      }),
    ).join('; ');

  const beginLogin = async (headers: Record<string, string> = {}) => {
    const response = await call('POST', '/api/auth/oidc/login', {}, undefined, headers);
    return { response, url: response.json().url as string, cookie: pairsOf(response).join('; ') };
  };
  const beginLink = async (session: string, password = account.password) => {
    const response = await call('POST', '/api/auth/oidc/link', { password }, session);
    return { response, url: response.json().url as string, cookie: pairsOf(response).join('; ') };
  };
  /**
   * The provider's redirect as the browser follows it: a cross-site navigation carrying only the
   * attempt's `state` cookie, never the Strict session cookie.
   */
  const callback = (
    start: { url: string; cookie: string },
    claims: Record<string, unknown> = claimsOf('subject-1'),
    mutate: (path: string) => string = (path) => path,
    cookie: string = start.cookie,
  ) => call('GET', mutate(idp.approve(start.url, claims)), undefined, cookie);
  const link = async (session: string, claims = claimsOf('subject-1')) => {
    const start = await beginLink(session);
    return { start, back: await callback(start, claims) };
  };
  const oidcSignIn = async (claims = claimsOf('subject-1')) => {
    const start = await beginLogin();
    const back = await callback(start, claims);
    return { start, back, session: pairsOf(back).join('; ') };
  };
  const events = () =>
    sqlite.prepare('SELECT actor, action, result, detail FROM audit_events ORDER BY id').all() as {
      actor: string;
      action: string;
      result: string;
      detail: string | null;
    }[];
  const count = (sql: string) => (sqlite.prepare(sql).get() as { n: number }).n;
  const hasSession = (response: { headers: Record<string, unknown> }) =>
    cookiesOf(response).some(
      (cookie) =>
        cookie.startsWith('homora.session_token=') && !cookie.startsWith('homora.session_token=;'),
    );
  return {
    idp,
    app,
    sqlite,
    vault,
    directory,
    auth,
    build,
    call,
    signIn,
    beginLogin,
    beginLink,
    callback,
    link,
    oidcSignIn,
    events,
    count,
    lines,
    hasSession,
    config,
    origin,
  };
}
