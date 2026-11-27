import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { AccountExistsError, AUTH_BASE_PATH, CLIENT_IP_HEADER, type createAuth } from '../auth.js';
import { setupSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import { ANONYMOUS_ACTOR, type AuditLog } from '../audit.js';
import { describeUserAgent } from '../client-info.js';
import { PASSKEY_PATHS } from '../passkey-gateway.js';
import { handlePasskeyRoute } from './passkey.js';
import type { OidcConfig } from '../oidc-config.js';
import {
  sanitizeTwoFactorBody,
  sessionCookieOf,
  TWO_FACTOR_PATHS,
  TWO_FACTOR_ROUTES,
  twoFactorErrorBody,
} from '../two-factor-gateway.js';

type Auth = ReturnType<typeof createAuth>;

// Only what the interface uses is reachable (sign-in, session, the second-factor and the passkey
// routes); every other Better Auth route stays closed until a feature needs it.
const FORWARDED_PATHS = new Set([
  `${AUTH_BASE_PATH}/sign-in/email`,
  `${AUTH_BASE_PATH}/sign-out`,
  `${AUTH_BASE_PATH}/get-session`,
  ...TWO_FACTOR_PATHS,
  ...PASSKEY_PATHS,
]);

const clientLabel = (userAgent: string | undefined) => {
  const { browser, os } = describeUserAgent(userAgent);
  return [browser, os].filter(Boolean).join(' · ') || null;
};

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: Auth,
  webPort: number,
  audit: AuditLog,
  oidc: OidcConfig | undefined,
) {
  app.get('/api/auth/status', async (request) => ({
    configured: auth.configured(),
    authenticated: (await auth.session(request.headers)) !== null,
    // Browsers only offer a passkey on these origins; the interface compares its own.
    passkey: { origins: auth.passkey.origins },
    oidc:
      oidc && auth.oidc
        ? {
            enabled: true,
            name: oidc.name,
            linked: auth.oidcLinks.list().some((link) => link.providerId === auth.oidc?.providerId),
          }
        : { enabled: false },
  }));
  app.post('/api/auth/setup', async (request, reply) => {
    if (auth.configured()) return reply.code(403).send(errorBody('account-exists'));
    const parsed = setupSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('account-setup-failed'));
    try {
      await auth.setup(parsed.data);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      if (error instanceof AccountExistsError)
        return reply.code(403).send(errorBody('account-exists'));
      return reply.code(400).send(errorBody('account-setup-failed'));
    }
  });
  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    async handler(request, reply) {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (!FORWARDED_PATHS.has(pathname)) return reply.code(404).send(errorBody('not-found'));
      if (PASSKEY_PATHS.has(pathname))
        return handlePasskeyRoute({ request, reply, pathname, auth, audit, webPort, clientLabel });
      const signingOut = pathname === `${AUTH_BASE_PATH}/sign-out`;
      const signedOutUser = signingOut ? await auth.session(request.headers) : null;
      const headers = fromNodeHeaders(request.headers);
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      headers.set(CLIENT_IP_HEADER, request.ip);
      const twoFactorRoute = TWO_FACTOR_PATHS.has(pathname);
      // A code sent while signed in confirms the setup; without a session it answers a challenge.
      const signedInBefore = twoFactorRoute ? await auth.session(request.headers) : null;
      const body =
        pathname === `${AUTH_BASE_PATH}/sign-in/email` &&
        request.body &&
        typeof request.body === 'object'
          ? { rememberMe: false, ...request.body }
          : twoFactorRoute
            ? sanitizeTwoFactorBody(pathname, request.body)
            : request.body;
      const hasBody = body !== undefined && body !== null;
      if (hasBody) headers.set('content-type', 'application/json');
      const response = await auth.handler(
        new Request(new URL(request.url, `http://localhost:${webPort}`), {
          method: request.method,
          headers,
          body: hasBody ? JSON.stringify(body) : undefined,
        }),
      );
      let text = response.body ? await response.text() : null;
      const ipAddress = request.ip;
      const setCookies = response.headers.getSetCookie();
      const failedLogin = () =>
        audit.record({
          actor: ANONYMOUS_ACTOR,
          action: 'login',
          result: 'failed',
          detail: String(audit.recentFailedLogins(ipAddress) + 1),
          ipAddress,
        });
      if (twoFactorRoute && response.status !== 200) {
        const translated = twoFactorErrorBody(text);
        if (translated) text = JSON.stringify(translated);
      }
      if (twoFactorRoute) {
        const actor = signedInBefore ? `user:${signedInBefore.userId}` : null;
        const ok = response.status === 200;
        if (
          !signedInBefore &&
          (pathname === TWO_FACTOR_ROUTES.verifyCode ||
            pathname === TWO_FACTOR_ROUTES.verifyRecoveryCode)
        ) {
          // Second step of a sign-in: only here the login counts as completed.
          if (ok) {
            const userId = (JSON.parse(text ?? '{}') as { user?: { id?: string } }).user?.id;
            if (userId) {
              const who = `user:${userId}`;
              audit.record({
                actor: who,
                action: 'login',
                result: 'ok',
                detail: clientLabel(request.headers['user-agent']),
                ipAddress,
              });
              if (pathname === TWO_FACTOR_ROUTES.verifyRecoveryCode)
                audit.record({
                  actor: who,
                  action: 'two-factor-recovery-used',
                  result: 'ok',
                  ipAddress,
                });
            }
          } else if (response.status !== 429) failedLogin();
        } else if (actor) {
          const action =
            pathname === TWO_FACTOR_ROUTES.disable
              ? 'two-factor-disable'
              : pathname === TWO_FACTOR_ROUTES.regenerateRecoveryCodes
                ? 'two-factor-codes-regenerate'
                : pathname === TWO_FACTOR_ROUTES.verifyCode && !signedInBefore?.twoFactorEnabled
                  ? 'two-factor-enable'
                  : null;
          if (action && response.status !== 429)
            audit.record({ actor, action, result: ok ? 'ok' : 'failed', ipAddress });
          // Sessions opened before the second step changed are not trusted afterwards.
          if (ok && (action === 'two-factor-enable' || action === 'two-factor-disable')) {
            const cookie = sessionCookieOf(setCookies);
            // Best effort: the response still has to deliver the new session cookie.
            if (cookie) await auth.revokeOtherSessions({ cookie }).catch(() => {});
          }
        }
      }
      if (pathname === `${AUTH_BASE_PATH}/sign-in/email`) {
        if (response.status === 200) {
          const result = JSON.parse(text ?? '{}') as {
            user?: { id?: string };
            twoFactorRedirect?: boolean;
          };
          // A pending second step is not a login yet: it is recorded once the code is verified.
          const userId = result.twoFactorRedirect ? undefined : result.user?.id;
          if (userId)
            audit.record({
              actor: `user:${userId}`,
              action: 'login',
              result: 'ok',
              detail: clientLabel(request.headers['user-agent']),
              ipAddress,
            });
        } else if (response.status !== 429) {
          // Only the address and the attempt count: the typed e-mail or password is never kept.
          failedLogin();
        }
      }
      if (signedOutUser && response.status === 200)
        audit.record({
          actor: `user:${signedOutUser.userId}`,
          action: 'logout',
          result: 'ok',
          detail: clientLabel(request.headers['user-agent']),
          ipAddress: request.ip,
        });
      reply.code(response.status);
      for (const name of ['content-type', 'x-retry-after']) {
        const value = response.headers.get(name);
        if (value) reply.header(name, value);
      }
      const secure = request.headers.origin?.startsWith('https://') ? '; Secure' : '';
      const cookies = response.headers.getSetCookie().map((cookie) => `${cookie}${secure}`);
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(text);
    },
  });
}
