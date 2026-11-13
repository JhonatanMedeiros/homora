import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import {
  CLIENT_IP_HEADER,
  InvalidPasswordError,
  RateLimitedError,
  REMEMBER_ME_HEADER,
  SessionNotFoundError,
  type createAuth,
} from '../auth.js';
import { errorBody } from '../api-error.js';
import { ANONYMOUS_ACTOR, type AuditLog } from '../audit.js';
import {
  asBrowserSessionCookie,
  parsePasskeyBody,
  PASSKEY_ROUTES,
  passkeyErrorBody,
  PUBLIC_PASSKEY_PATHS,
  publicPasskey,
} from '../passkey-gateway.js';

type Auth = ReturnType<typeof createAuth>;

type Context = {
  request: FastifyRequest;
  reply: FastifyReply;
  pathname: string;
  auth: Auth;
  audit: AuditLog;
  webPort: number;
  clientLabel: (userAgent: string | undefined) => string | null;
};

/**
 * Passkey routes: sign-in (public) and registration, listing, renaming and removal (signed-in
 * administrator). Registration and removal ask for the password again; the plugin additionally
 * requires a fresh session. Bodies are validated and reduced, responses never carry the public
 * key, credential ID, counter or session token.
 */
export async function handlePasskeyRoute({
  request,
  reply,
  pathname,
  auth,
  audit,
  webPort,
  clientLabel,
}: Context) {
  const route = Object.values(PASSKEY_ROUTES).find((candidate) => candidate.path === pathname);
  if (!route || route.method !== request.method)
    return reply.code(404).send(errorBody('not-found'));
  const ipAddress = request.ip;
  const signedIn = await auth.session(request.headers);
  if (!PUBLIC_PASSKEY_PATHS.has(pathname) && !signedIn)
    return reply.code(401).send(errorBody('auth-required'));
  const actor = signedIn ? `user:${signedIn.userId}` : ANONYMOUS_ACTOR;
  const isSignIn = pathname === PASSKEY_ROUTES.signIn.path;

  const parsed = parsePasskeyBody(
    pathname,
    request.method === 'POST' ? (request.body ?? {}) : undefined,
  );
  if (!parsed.ok) return reply.code(400).send(errorBody(parsed.code));
  const { password, rememberMe, ...forwarded } = (parsed.body ?? {}) as {
    password?: string;
    rememberMe?: boolean;
    [key: string]: unknown;
  };

  const audited = (action: string, result: 'ok' | 'failed') =>
    audit.record({ actor, action, result, ipAddress });
  const failedAction =
    pathname === PASSKEY_ROUTES.remove.path
      ? 'passkey-remove'
      : pathname === PASSKEY_ROUTES.registrationOptions.path
        ? 'passkey-add'
        : null;
  if (password !== undefined) {
    try {
      await auth.confirmPassword(request.headers, password);
    } catch (error) {
      if (error instanceof RateLimitedError)
        return reply.code(429).send(errorBody('too-many-attempts'));
      if (error instanceof SessionNotFoundError)
        return reply.code(401).send(errorBody('auth-required'));
      if (failedAction) audited(failedAction, 'failed');
      if (error instanceof InvalidPasswordError)
        return reply.code(400).send(errorBody('invalid-current-password'));
      throw error;
    }
  }

  const headers = fromNodeHeaders(request.headers);
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  headers.delete(REMEMBER_ME_HEADER);
  headers.set(CLIENT_IP_HEADER, request.ip);
  if (isSignIn && rememberMe === true) headers.set(REMEMBER_ME_HEADER, '1');
  // The plugin's registration challenge is a GET; the password never reaches it.
  const method = pathname === PASSKEY_ROUTES.registrationOptions.path ? 'GET' : request.method;
  const body = method === 'POST' ? JSON.stringify(forwarded) : undefined;
  if (body) headers.set('content-type', 'application/json');
  else headers.delete('content-type');
  const target = new URL(
    pathname === PASSKEY_ROUTES.registrationOptions.path ? pathname : request.url.split('?')[0]!,
    `http://localhost:${webPort}`,
  );
  const response = await auth.handler(new Request(target, { method, headers, body }));
  let text = response.body ? await response.text() : null;
  const setCookies = response.headers.getSetCookie();
  const ok = response.status === 200;

  if (!ok) {
    text = JSON.stringify(passkeyErrorBody(pathname, response.status, text));
  } else if (pathname === PASSKEY_ROUTES.list.path) {
    const rows = JSON.parse(text ?? '[]') as Parameters<typeof publicPasskey>[0][];
    text = JSON.stringify(rows.map(publicPasskey));
  } else if (pathname === PASSKEY_ROUTES.register.path) {
    text = JSON.stringify(publicPasskey(JSON.parse(text ?? '{}')));
  } else if (pathname === PASSKEY_ROUTES.rename.path) {
    text = JSON.stringify(publicPasskey(JSON.parse(text ?? '{}').passkey));
  } else if (isSignIn) {
    // The session token stays in the cookie; the body only says who signed in.
    const userId = (JSON.parse(text ?? '{}') as { user?: { id?: string } }).user?.id;
    text = JSON.stringify({ user: { id: userId } });
  }

  if (isSignIn) {
    if (ok) {
      const userId = JSON.parse(text ?? '{}').user?.id as string | undefined;
      if (userId)
        audit.record({
          actor: `user:${userId}`,
          action: 'login',
          result: 'ok',
          detail: ['Passkey', clientLabel(request.headers['user-agent'])]
            .filter(Boolean)
            .join(' · '),
          ipAddress,
        });
    } else if (response.status !== 429) {
      // Only the address and the attempt count, like a failed password.
      audit.record({
        actor: ANONYMOUS_ACTOR,
        action: 'login',
        result: 'failed',
        detail: String(audit.recentFailedLogins(ipAddress) + 1),
        ipAddress,
      });
    }
  } else if (response.status !== 429) {
    const action =
      pathname === PASSKEY_ROUTES.register.path
        ? 'passkey-add'
        : pathname === PASSKEY_ROUTES.rename.path
          ? 'passkey-rename'
          : pathname === PASSKEY_ROUTES.remove.path
            ? 'passkey-remove'
            : null;
    if (action) audited(action, ok ? 'ok' : 'failed');
  }
  // A lost or stolen authenticator is removed: sessions opened before are no longer trusted.
  if (ok && pathname === PASSKEY_ROUTES.remove.path) {
    const own = request.headers.cookie
      ?.split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith('homora.session_token='));
    // Best effort: the removal itself already succeeded.
    if (own) await auth.revokeOtherSessions({ cookie: own }).catch(() => undefined);
  }

  reply.code(response.status);
  for (const name of ['content-type', 'x-retry-after']) {
    const value = response.headers.get(name);
    if (value) reply.header(name, value);
  }
  const secure = request.headers.origin?.startsWith('https://') ? '; Secure' : '';
  const cookies = setCookies.map(
    (cookie) =>
      `${isSignIn && rememberMe !== true ? asBrowserSessionCookie(cookie) : cookie}${secure}`,
  );
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  return reply.send(text);
}
