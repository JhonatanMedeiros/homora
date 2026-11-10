import type { FastifyInstance } from 'fastify';
import type { createAuth } from '../auth.js';

type Auth = ReturnType<typeof createAuth>;

export function registerAuthRoutes(app: FastifyInstance, auth: Auth) {
  app.get('/api/auth/status', async (request) => ({
    configured: auth.configured(),
    authenticated: auth.authorized(request.headers.cookie),
  }));
  app.post('/api/auth/setup', async (request, reply) => {
    if (auth.configured()) return reply.code(403).send({ error: 'Conta já configurada.' });
    try {
      auth.setup((request.body as { password?: unknown })?.password);
      return reply.code(201).send({ ok: true });
    } catch {
      return reply.code(400).send({
        error: 'Não foi possível criar a conta. Use uma senha com pelo menos 8 caracteres.',
      });
    }
  });
  app.post('/api/auth/login', async (request, reply) => {
    const token = auth.login((request.body as { password?: unknown })?.password, request.ip);
    if (!token)
      return reply.code(401).send({ error: 'Credenciais inválidas ou tentativas excedidas.' });
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
