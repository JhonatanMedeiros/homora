import type { FastifyInstance } from 'fastify';
import {
  EmailUnchangedError,
  InvalidPasswordError,
  RateLimitedError,
  SessionNotFoundError,
  type createAuth,
} from '../auth.js';
import {
  auditQuerySchema,
  changeEmailSchema,
  changePasswordSchema,
  profileSchema,
} from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { AuditLog } from '../audit.js';
import { describeUserAgent } from '../client-info.js';

type Auth = ReturnType<typeof createAuth>;

/** Signed-in administrator's own account: profile, password, sessions, and the activity feed. */
export function registerAccountRoutes(app: FastifyInstance, auth: Auth, audit: AuditLog) {
  const actor = async (request: { headers: Parameters<Auth['session']>[0] }) => {
    const session = await auth.session(request.headers);
    return session ? `user:${session.userId}` : null;
  };

  app.get('/api/account', async (request, reply) => {
    const profile = await auth.profile(request.headers);
    return profile ?? reply.code(401).send(errorBody('auth-required'));
  });

  app.patch('/api/account', async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-profile'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    await auth.updateName(request.headers, parsed.data.name);
    audit.record({ actor: who, action: 'profile-update', result: 'ok', ipAddress: request.ip });
    return auth.profile(request.headers);
  });

  app.patch('/api/account/email', async (request, reply) => {
    const parsed = changeEmailSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-email'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    try {
      await auth.changeEmail(request.headers, parsed.data);
    } catch (error) {
      if (error instanceof RateLimitedError)
        return reply.code(429).send(errorBody('too-many-attempts'));
      if (error instanceof EmailUnchangedError)
        return reply.code(400).send(errorBody('email-unchanged'));
      if (error instanceof InvalidPasswordError) {
        audit.record({
          actor: who,
          action: 'email-change',
          result: 'failed',
          ipAddress: request.ip,
        });
        return reply.code(400).send(errorBody('invalid-current-password'));
      }
      throw error;
    }
    // The address itself is never written to the log: it is the sign-in name.
    audit.record({ actor: who, action: 'email-change', result: 'ok', ipAddress: request.ip });
    return auth.profile(request.headers);
  });

  app.post('/api/account/password', async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-new-password'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    try {
      await auth.changePassword(request.headers, parsed.data);
    } catch (error) {
      if (error instanceof RateLimitedError)
        return reply.code(429).send(errorBody('too-many-attempts'));
      if (error instanceof InvalidPasswordError) {
        audit.record({
          actor: who,
          action: 'password-change',
          result: 'failed',
          ipAddress: request.ip,
        });
        return reply.code(400).send(errorBody('invalid-current-password'));
      }
      return reply.code(400).send(errorBody('invalid-new-password'));
    }
    audit.record({
      actor: who,
      action: 'password-change',
      result: 'ok',
      detail: parsed.data.revokeOthers ? 'revoked-others' : null,
      ipAddress: request.ip,
    });
    return { ok: true };
  });

  app.get('/api/account/sessions', async (request) =>
    (await auth.listSessions(request.headers)).map(({ userAgent, ...session }) => ({
      ...session,
      ...describeUserAgent(userAgent),
    })),
  );

  app.post('/api/account/sessions/revoke-others', async (request, reply) => {
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    await auth.revokeOtherSessions(request.headers);
    audit.record({
      actor: who,
      action: 'sessions-revoke-others',
      result: 'ok',
      ipAddress: request.ip,
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>(
    '/api/account/sessions/:id/revoke',
    async (request, reply) => {
      const who = await actor(request);
      if (!who) return reply.code(401).send(errorBody('auth-required'));
      try {
        await auth.revokeSession(request.headers, request.params.id.slice(0, 128));
      } catch (error) {
        if (error instanceof SessionNotFoundError)
          return reply.code(404).send(errorBody('session-not-found'));
        throw error;
      }
      audit.record({ actor: who, action: 'session-revoke', result: 'ok', ipAddress: request.ip });
      return { ok: true };
    },
  );

  app.get('/api/activity', async (request, reply) => {
    const parsed = auditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-query'));
    return audit.list(parsed.data);
  });
}
