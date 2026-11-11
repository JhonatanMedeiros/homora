import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { AccountExistsError, AUTH_BASE_PATH, CLIENT_IP_HEADER, type createAuth } from '../auth.js';
import { setupSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';

type Auth = ReturnType<typeof createAuth>;

// Only what the interface uses is reachable; every other Better Auth route stays closed until
// a feature needs it.
const FORWARDED_PATHS = new Set([
  `${AUTH_BASE_PATH}/sign-in/email`,
  `${AUTH_BASE_PATH}/sign-out`,
  `${AUTH_BASE_PATH}/get-session`,
]);

export function registerAuthRoutes(app: FastifyInstance, auth: Auth, webPort: number) {
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
      reply.code(response.status);
      for (const name of ['content-type', 'x-retry-after']) {
        const value = response.headers.get(name);
        if (value) reply.header(name, value);
      }
      const secure = request.headers.origin?.startsWith('https://') ? '; Secure' : '';
      const cookies = response.headers.getSetCookie().map((cookie) => `${cookie}${secure}`);
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
