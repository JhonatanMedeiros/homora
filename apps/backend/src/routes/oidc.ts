import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AUTH_BASE_PATH,
  CLIENT_IP_HEADER,
  InvalidPasswordError,
  OIDC_CALLBACK_PREFIX,
  RateLimitedError,
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
import type { OidcConfig } from '../oidc-config.js';

type Auth = ReturnType<typeof createAuth>;

const passwordSchema = z.object({ password: z.string().min(1).max(1024) }).strict();
const SESSION_COOKIE = 'homora.session_token=';

/** Path of the provider's redirect back to Homora, relative to the configured origin. */
export const oidcCallbackPath = (providerId: string) =>
  `${AUTH_BASE_PATH}${OIDC_CALLBACK_PREFIX}${providerId}`;

/**
 * Optional OIDC sign-in and linking (ADR 0032). The protocol, the PKCE/state/nonce handling, the
 * ID token verification, the account link and the session are Better Auth's generic OAuth plugin.
 * Homora only adds thin gateway routes: starting needs the configured origin (and the password to
 * link), the one callback route is forwarded with its outcome reduced and audited, and the link
 * is listed and removed through account routes. No other Better Auth route is reachable.
 */
export function registerOidcRoutes(
  app: FastifyInstance,
  auth: Auth,
  audit: AuditLog,
  config: OidcConfig | undefined,
) {
  const oidc = auth.oidc;
  const limiter = createRateLimitStorage();
  const secure = config?.redirectOrigin.startsWith('https://') ? '; Secure' : '';
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
    if (!oidc || !config) return reply.code(404).send(errorBody('oidc-not-configured'));
    // Cookies of the attempt are set for the host the provider returns to.
    if (request.headers.origin !== config.redirectOrigin)
      return reply.code(400).send(errorBody('oidc-wrong-origin'));
    return null;
  };
  const start = async (request: FastifyRequest, reply: FastifyReply, mode: 'login' | 'link') => {
    try {
      const { url, cookies } = await oidc!.start(request.headers, mode);
      reply.header(
        'set-cookie',
        cookies.map((cookie) => `${cookie}${secure}`),
      );
      return { url };
    } catch (error) {
      request.log.warn({ err: error }, 'OIDC could not start');
      return reply.code(503).send(errorBody('oidc-unavailable'));
    }
  };

  app.post('/api/auth/oidc/login', async (request, reply) => {
    const blocked = guardStart(request, reply);
    if (blocked) return blocked;
    if (await limited(request, 'oidc-login'))
      return reply.code(429).send(errorBody('too-many-attempts'));
    return start(request, reply, 'login');
  });

  app.post('/api/auth/oidc/link', async (request, reply) => {
    const blocked = guardStart(request, reply);
    if (blocked) return blocked;
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    if (oidc!.links().some((link) => link.userId === session.userId))
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

  if (oidc) {
    // The provider's redirect: a cross-site GET with the attempt's `state` cookie.
    app.get(oidcCallbackPath(oidc.providerId), async (request, reply) => {
      const unavailable = () => reply.redirect('/login?error=failed');
      if (await limited(request, 'oidc-callback')) return unavailable();
      const headers = fromNodeHeaders(request.headers);
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      headers.set(CLIENT_IP_HEADER, request.ip);
      const response = await auth.handler(
        new Request(new URL(request.url, config!.redirectOrigin), { method: 'GET', headers }),
      );
      const setCookies = response.headers.getSetCookie();
      const sessionCookie = setCookies.find(
        (cookie) => cookie.startsWith(SESSION_COOKIE) && !cookie.startsWith(`${SESSION_COOKIE};`),
      );
      let location = '/login?error=failed';
      const raw = response.headers.get('location');
      if (raw) {
        try {
          const target = new URL(raw, config!.redirectOrigin);
          if (target.origin === config!.redirectOrigin) {
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
        const link = oidc.links().find((row) => row.providerId === oidc.providerId);
        if (link || failed)
          audit.record({
            actor: link ? `user:${link.userId}` : ANONYMOUS_ACTOR,
            action: 'oidc-link',
            result: failed ? 'failed' : 'ok',
            ipAddress: request.ip,
          });
      } else if (failed) failedLogin(request);
      reply.header(
        'set-cookie',
        setCookies.map((cookie) => `${asBrowserSessionCookie(cookie)}${secure}`),
      );
      reply.header('referrer-policy', 'no-referrer');
      return reply.redirect(location);
    });
  }

  app.get('/api/account/oidc', async (request) => {
    const session = await auth.session(request.headers);
    const link = session ? oidc?.links().find((row) => row.userId === session.userId) : undefined;
    return {
      enabled: config !== undefined,
      name: config?.name ?? null,
      redirectUri:
        config && oidc ? `${config.redirectOrigin}${oidcCallbackPath(oidc.providerId)}` : null,
      identity: link
        ? { createdAt: link.createdAt, current: link.providerId === oidc?.providerId }
        : null,
    };
  });

  app.post('/api/account/oidc/unlink', async (request, reply) => {
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    const actor = `user:${session.userId}`;
    const link = oidc?.links().find((row) => row.userId === session.userId);
    try {
      await auth.confirmPassword(request.headers, parsed.data.password);
    } catch (error) {
      if (error instanceof RateLimitedError)
        return reply.code(429).send(errorBody('too-many-attempts'));
      if (error instanceof InvalidPasswordError) {
        audit.record({ actor, action: 'oidc-unlink', result: 'failed', ipAddress: request.ip });
        return reply.code(400).send(errorBody('invalid-current-password'));
      }
      if (error instanceof SessionNotFoundError)
        return reply.code(401).send(errorBody('auth-required'));
      throw error;
    }
    if (!oidc || !link) return reply.code(404).send(errorBody('not-found'));
    try {
      await oidc.unlink(request.headers, link.id);
    } catch (error) {
      if ((error as { body?: { code?: string } }).body?.code === 'SESSION_NOT_FRESH')
        return reply.code(400).send(errorBody('session-not-fresh'));
      audit.record({ actor, action: 'oidc-unlink', result: 'failed', ipAddress: request.ip });
      return reply.code(400).send(errorBody('oidc-link-failed'));
    }
    // Sessions do not record how they were opened, so every other one ends with the link.
    await auth.revokeOtherSessions(request.headers).catch(() => {});
    audit.record({ actor, action: 'oidc-unlink', result: 'ok', ipAddress: request.ip });
    return { ok: true };
  });
}
