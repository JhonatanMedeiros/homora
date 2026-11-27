import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AUTH_BASE_PATH,
  CLIENT_IP_HEADER,
  InvalidPasswordError,
  OIDC_CALLBACK_PREFIX,
  RateLimitedError,
  REMEMBER_ME_HEADER,
  SessionNotFoundError,
  type createAuth,
} from '../auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import {
  createRateLimitStorage,
  SIGN_IN_MAX_ATTEMPTS,
  SIGN_IN_WINDOW_SECONDS,
} from '../auth-rate-limit.js';
import { errorBody } from '../api-error.js';
import { ANONYMOUS_ACTOR, type AuditLog } from '../audit.js';
import { describeUserAgent } from '../client-info.js';
import { asBrowserSessionCookie } from '../passkey-gateway.js';
import type { OidcManager } from '../oidc-manager.js';

type Auth = ReturnType<typeof createAuth>;

const passwordSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
const loginSchema = z
  .object({ rememberMe: z.boolean().optional(), auto: z.boolean().optional() })
  .strict();
const SESSION_COOKIE = 'homora.session_token=';
/** The longer-session choice made before leaving for the provider; only the callback reads it. */
const REMEMBER_COOKIE = 'homora.oidc-remember';

/** Path of the provider's redirect back to Homora, relative to the configured origin. */
export const oidcCallbackPath = (providerId: string) =>
  `${AUTH_BASE_PATH}${OIDC_CALLBACK_PREFIX}${providerId}`;

const rememberCookie = (value: '1' | '') =>
  `${REMEMBER_COOKIE}=${value}; Path=${AUTH_BASE_PATH}${OIDC_CALLBACK_PREFIX}; HttpOnly; SameSite=Lax; Max-Age=${value ? 600 : 0}`;

/**
 * Optional OIDC sign-in and linking (ADR 0032). The protocol, the PKCE/state/nonce handling, the
 * ID token verification, the account link and the session are Better Auth's generic OAuth plugin.
 * Homora only adds thin gateway routes: starting needs the configured origin (and the password to
 * link), and the one callback route is forwarded with its outcome reduced and audited. The
 * configuration and the link are managed by account routes. No other Better Auth route is
 * reachable.
 */
export function registerOidcRoutes(
  app: FastifyInstance,
  auth: Auth,
  audit: AuditLog,
  manager: OidcManager,
) {
  const limiter = createRateLimitStorage();
  const secure = manager.redirectOrigin.startsWith('https://') ? '; Secure' : '';
  const limited = async (request: FastifyRequest, scope: string) =>
    !(
      await limiter.consume(`${scope}:${request.ip}`, {
        window: SIGN_IN_WINDOW_SECONDS,
        max: SIGN_IN_MAX_ATTEMPTS,
      })
    ).allowed;
  const clientLabel = (request: FastifyRequest) => {
    const { browser, os } = describeUserAgent(request.headers['user-agent']);
    return [browser, os].filter(Boolean).join(' · ') || null;
  };
  const failedLogin = (request: FastifyRequest) =>
    audit.record({
      actor: ANONYMOUS_ACTOR,
      action: 'login',
      result: 'failed',
      detail: `OIDC · ${audit.recentFailedLogins(request.ip) + 1}`,
      ipAddress: request.ip,
    });

  const guardStart = (request: FastifyRequest, reply: FastifyReply) => {
    if (!auth.oidc) return reply.code(404).send(errorBody('oidc-not-configured'));
    // Cookies of the attempt are set for the host the provider returns to.
    if (request.headers.origin !== manager.redirectOrigin)
      return reply.code(400).send(errorBody('oidc-wrong-origin'));
    return null;
  };
  const start = async (
    request: FastifyRequest,
    reply: FastifyReply,
    mode: 'login' | 'link',
    remember = false,
  ) => {
    try {
      const oidc = auth.oidc;
      if (!oidc) return reply.code(404).send(errorBody('oidc-not-configured'));
      const { url, cookies } = await oidc.start(request.headers, mode);
      reply.header(
        'set-cookie',
        [...cookies, rememberCookie(remember ? '1' : '')].map((cookie) => `${cookie}${secure}`),
      );
      return { url };
    } catch (error) {
      request.log.warn({ err: error }, 'OIDC could not start');
      // Finds out what is wrong, for the log and the sign-in page.
      manager.testInBackground();
      return reply.code(503).send(errorBody('oidc-unavailable'));
    }
  };

  app.post('/api/auth/oidc/login', async (request, reply) => {
    const blocked = guardStart(request, reply);
    if (blocked) return blocked;
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    if (await limited(request, 'oidc-login'))
      return reply.code(429).send(errorBody('too-many-attempts'));
    if (!parsed.data.auto) return start(request, reply, 'login', parsed.data.rememberMe === true);
    const preferences = manager.preferences();
    if (!preferences.autoRedirect || auth.oidcLinks.list().length === 0)
      return reply.code(409).send(errorBody('oidc-auto-unavailable'));
    // Leaving without being asked only for a provider that answers now: otherwise the browser
    // would be stranded on its error page.
    if ((await manager.test()).status !== 'ok')
      return reply.code(503).send(errorBody('oidc-unavailable'));
    return start(request, reply, 'login', preferences.longSession);
  });

  app.post('/api/auth/oidc/link', async (request, reply) => {
    const blocked = guardStart(request, reply);
    if (blocked) return blocked;
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    if (auth.oidcLinks.list().some((link) => link.userId === session.userId))
      return reply.code(409).send(errorBody('oidc-already-linked'));
    try {
      await auth.confirmPassword(request.headers, parsed.data.password);
    } catch (error) {
      if (error instanceof RateLimitedError)
        return reply.code(429).send(errorBody('too-many-attempts'));
      if (error instanceof SessionNotFoundError)
        return reply.code(401).send(errorBody('auth-required'));
      if (error instanceof InvalidPasswordError) {
        audit.record({
          actor: `user:${session.userId}`,
          action: 'oidc-link',
          result: 'failed',
          ipAddress: request.ip,
        });
        return reply.code(400).send(errorBody('invalid-current-password'));
      }
      throw error;
    }
    return start(request, reply, 'link');
  });

  // One callback at a time, so that two returning link attempts cannot both be accepted. Each
  // provider has its own turn: one that stopped answering never delays its replacement.
  const queues = new WeakMap<object, Promise<unknown>>();
  const inTurn = <T>(provider: object, work: () => Promise<T>) => {
    const run = (queues.get(provider) ?? Promise.resolve()).then(work);
    queues.set(
      provider,
      run.catch(() => {}),
    );
    return run;
  };

  // The provider's redirect: a cross-site GET with the attempt's `state` cookie. Only the
  // provider in use answers.
  app.get<{ Params: { provider: string } }>(
    oidcCallbackPath(':provider'),
    async (request, reply) => {
      const { provider } = request.params;
      const active = auth.oidc;
      if (active?.providerId !== provider) return reply.code(404).send(errorBody('not-found'));
      const unavailable = () => reply.redirect('/login?error=failed');
      if (await limited(request, 'oidc-callback')) return unavailable();
      const headers = fromNodeHeaders(request.headers);
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      headers.set(CLIENT_IP_HEADER, request.ip);
      const remember = (request.headers.cookie ?? '')
        .split(';')
        .some((pair) => pair.trim() === `${REMEMBER_COOKIE}=1`);
      headers.delete(REMEMBER_ME_HEADER);
      if (remember) headers.set(REMEMBER_ME_HEADER, '1');
      let response: Response;
      try {
        response = await inTurn(active.config, () =>
          auth.handler(
            new Request(new URL(request.url, manager.redirectOrigin), { method: 'GET', headers }),
          ),
        );
      } catch (error) {
        request.log.warn({ err: error }, 'OIDC callback could not be completed');
        manager.testInBackground();
        return unavailable();
      }
      const setCookies = response.headers.getSetCookie();
      const sessionCookie = setCookies.find(
        (cookie) => cookie.startsWith(SESSION_COOKIE) && !cookie.startsWith(`${SESSION_COOKIE};`),
      );
      let location = '/login?error=failed';
      const raw = response.headers.get('location');
      if (raw) {
        try {
          const target = new URL(raw, manager.redirectOrigin);
          // Anything else is the library's own error page, which the gateway does not serve.
          if (
            target.origin === manager.redirectOrigin &&
            ['/', '/login', '/account'].includes(target.pathname)
          ) {
            // Only whether the provider refused, never its text, goes back to the page.
            const denied = target.searchParams.get('error') === 'access_denied';
            location = target.searchParams.has('error')
              ? `${target.pathname}?error=${denied ? 'denied' : 'failed'}`
              : `${target.pathname}${target.search}`;
          }
        } catch {
          // The generic failure above stays.
        }
      }
      const failed = location.includes('error=');
      const linking = location.startsWith('/account');
      if (sessionCookie && !failed) {
        const pair = sessionCookie.split(';')[0]!;
        const session = await auth.session({ cookie: pair });
        if (session)
          audit.record({
            actor: `user:${session.userId}`,
            action: 'login',
            result: 'ok',
            detail: ['OIDC', clientLabel(request)].filter(Boolean).join(' · '),
            ipAddress: request.ip,
          });
      } else if (linking) {
        const link = auth.oidcLinks.list().find((row) => row.providerId === provider);
        if (link || failed)
          audit.record({
            actor: link ? `user:${link.userId}` : ANONYMOUS_ACTOR,
            action: 'oidc-link',
            result: failed ? 'failed' : 'ok',
            ipAddress: request.ip,
          });
      } else if (failed) failedLogin(request);
      if (failed) manager.testInBackground();
      reply.header(
        'set-cookie',
        [
          // A longer session keeps the lifetime the library gave its cookie.
          ...setCookies.map((cookie) => (remember ? cookie : asBrowserSessionCookie(cookie))),
          rememberCookie(''),
        ].map((cookie) => `${cookie}${secure}`),
      );
      reply.header('referrer-policy', 'no-referrer');
      return reply.redirect(location);
    },
  );
}
