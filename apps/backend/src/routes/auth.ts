import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { AccountExistsError, AUTH_BASE_PATH, CLIENT_IP_HEADER, type createAuth } from '../auth.js';
import { setupSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import { ANONYMOUS_ACTOR, type AuditLog } from '../audit.js';
import { describeUserAgent } from '../client-info.js';

type Auth = ReturnType<typeof createAuth>;

// Only what the interface uses is reachable; every other Better Auth route stays closed until
// a feature needs it.
const FORWARDED_PATHS = new Set([
  `${AUTH_BASE_PATH}/sign-in/email`,
  `${AUTH_BASE_PATH}/sign-out`,
  `${AUTH_BASE_PATH}/get-session`,
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
) {
  app.get('/api/auth/status', async (request) => ({
    configured: auth.configured(),
    authenticated: (await auth.session(request.headers)) !== null,
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
      const signingOut = pathname === `${AUTH_BASE_PATH}/sign-out`;
      const signedOutUser = signingOut ? await auth.session(request.headers) : null;
      const headers = fromNodeHeaders(request.headers);
      headers.delete('content-length');
      headers.delete('transfer-encoding');
      headers.set(CLIENT_IP_HEADER, request.ip);
      const hasBody = request.body !== undefined && request.body !== null;
      if (hasBody) headers.set('content-type', 'application/json');
      const response = await auth.handler(
        new Request(new URL(request.url, `http://localhost:${webPort}`), {
          method: request.method,
          headers,
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );
      const text = response.body ? await response.text() : null;
      if (pathname === `${AUTH_BASE_PATH}/sign-in/email`) {
        const ipAddress = request.ip;
        if (response.status === 200) {
          const userId = (JSON.parse(text ?? '{}') as { user?: { id?: string } }).user?.id;
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
          audit.record({
            actor: ANONYMOUS_ACTOR,
            action: 'login',
            result: 'failed',
            detail: String(audit.recentFailedLogins(ipAddress) + 1),
            ipAddress,
          });
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
