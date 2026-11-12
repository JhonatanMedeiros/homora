import type { FastifyInstance } from 'fastify';
import { contrastProblems, parseAppearance, type Appearance } from '@homora/shared';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { AppearanceStore } from '../appearance.js';
import { ERROR_MESSAGES, errorBody } from '../api-error.js';

type Auth = ReturnType<typeof createAuth>;

const summary = (a: Appearance) =>
  `accent:${a.accent === 'custom' ? a.customAccent : a.accent} background:${a.background} opacity:${a.cardOpacity} blur:${a.blur ? 'on' : 'off'}`;

/**
 * Authenticated read/write of the instance appearance. There is deliberately no MCP tool and no
 * agent scope for it: agents never change how Homora looks.
 */
export function registerAppearanceRoutes(
  app: FastifyInstance,
  appearance: AppearanceStore,
  auth: Auth,
  audit: AuditLog,
) {
  const actor = async (headers: Parameters<Auth['session']>[0]) => {
    const session = await auth.session(headers);
    return session ? `user:${session.userId}` : 'user:unknown';
  };

  app.get('/api/appearance', async () => ({ appearance: appearance.get() }));

  app.put('/api/appearance', async (request, reply) => {
    const parsed = parseAppearance(request.body);
    if (!parsed) return reply.code(400).send(errorBody('invalid-data'));
    const problems = contrastProblems(parsed);
    if (problems.length > 0)
      return reply.code(422).send({
        code: 'appearance-contrast',
        error: ERROR_MESSAGES['appearance-contrast'],
        problems,
      });
    appearance.set(parsed);
    audit.record({
      actor: await actor(request.headers),
      action: 'appearance-update',
      result: 'ok',
      detail: summary(parsed),
      ipAddress: request.ip,
    });
    return { appearance: appearance.get() };
  });

  app.delete('/api/appearance', async (request) => {
    appearance.reset();
    audit.record({
      actor: await actor(request.headers),
      action: 'appearance-reset',
      result: 'ok',
      ipAddress: request.ip,
    });
    return { appearance: appearance.get() };
  });
}
