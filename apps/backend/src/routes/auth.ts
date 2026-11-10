import type { FastifyInstance } from 'fastify';
import type { createAuth } from '../auth.js';
import { loginPasswordSchema, passwordSchema } from '../input-schemas.js';
import { errorBody } from '../api-error.js';

type Auth = ReturnType<typeof createAuth>;

export function registerAuthRoutes(app: FastifyInstance, auth: Auth) {
  app.get('/api/auth/status', async (request) => ({
    configured: auth.configured(),
    authenticated: auth.authorized(request.headers.cookie),
  }));
  app.post('/api/auth/setup', async (request, reply) => {
    if (auth.configured()) return reply.code(403).send(errorBody('account-exists'));
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('account-setup-failed'));
    try {
      auth.setup(parsed.data.password);
      return reply.code(201).send({ ok: true });
    } catch {
      return reply.code(400).send(errorBody('account-setup-failed'));
    }
  });
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send(errorBody('invalid-login'));
    const token = auth.login(parsed.data.password, request.ip);
    if (!token) return reply.code(401).send(errorBody('invalid-login'));
    return reply
      .header(
        'Set-Cookie',
        `homora_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${request.headers.origin?.startsWith('https://') ? '; Secure' : ''}`,
      )
      .send({ ok: true });
  });
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(request.headers.cookie);
    return reply
      .header(
        'Set-Cookie',
        `homora_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${request.headers.origin?.startsWith('https://') ? '; Secure' : ''}`,
      )
      .send({ ok: true });
  });
}
