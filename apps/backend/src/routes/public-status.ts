import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import type { createPublicStatus } from '../public-status.js';
import { errorBody } from '../api-error.js';
import { parseId, publicStatusSettingsSchema, servicePublicSchema } from '../input-schemas.js';

type Auth = ReturnType<typeof createAuth>;
type PublicStatus = ReturnType<typeof createPublicStatus>;
/** The only anonymous API path. Matched exactly: never a prefix. */
export const PUBLIC_STATUS_PATH = '/api/public/status';
export const PUBLIC_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;

export function registerPublicStatusRoutes(
  app: FastifyInstance,
  publicStatus: PublicStatus,
  auth: Auth,
  audit: AuditLog,
) {
  // Encapsulated so the limiter only ever applies to this route.
  void app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: PUBLIC_RATE_LIMIT.max,
      timeWindow: PUBLIC_RATE_LIMIT.timeWindow,
      // Thrown by the plugin, so it must carry the status; the body keeps the API error shape.
      errorResponseBuilder: () =>
        Object.assign(new Error('Too many requests.'), { statusCode: 429 }),
    });
    scope.setErrorHandler((error, _request, reply) => {
      if ((error as { statusCode?: number }).statusCode === 429)
        return reply.code(429).header('Retry-After', '60').send(errorBody('too-many-requests'));
      return reply.send(error);
    });
    scope.get(PUBLIC_STATUS_PATH, async (_request, reply) => {
      const body = publicStatus.snapshot();
      // Off or nothing shared: indistinguishable from a route that does not exist.
      if (!body) return reply.code(404).send(errorBody('not-found'));
      return reply.header('Cache-Control', 'public, max-age=15').send(body);
    });
  });

  const actor = async (headers: Parameters<Auth['session']>[0]) => {
    const session = await auth.session(headers);
    return session ? `user:${session.userId}` : 'user:unknown';
  };
  const admin = () => ({ ...publicStatus.settings(), preview: publicStatus.preview() });

  app.get('/api/public-status/admin', async () => admin());

  app.put('/api/public-status/admin', async (request, reply) => {
    const parsed = publicStatusSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const before = publicStatus.settings();
    const who = await actor(request.headers);
    if (parsed.data.title !== undefined) publicStatus.setTitle(parsed.data.title);
    if (parsed.data.enabled !== undefined) publicStatus.setEnabled(parsed.data.enabled);
    const after = publicStatus.settings();
    if (before.enabled !== after.enabled)
      audit.record({
        actor: who,
        action: 'public-status-update',
        result: 'ok',
        detail: after.enabled ? 'enabled' : 'disabled',
        ipAddress: request.ip,
      });
    if (before.title !== after.title)
      audit.record({
        actor: who,
        action: 'public-status-update',
        result: 'ok',
        detail: 'title',
        ipAddress: request.ip,
      });
    return admin();
  });

  app.put<{ Params: { id: string } }>('/api/services/:id/public', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = servicePublicSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const before = publicStatus.publicIds().has(id);
    if (!publicStatus.setServicePublic(id, parsed.data.isPublic))
      return reply.code(404).send(errorBody('service-not-found'));
    if (before !== parsed.data.isPublic)
      audit.record({
        actor: await actor(request.headers),
        action: 'service-public',
        result: 'ok',
        detail: `${id}:${parsed.data.isPublic ? 'public' : 'private'}`,
        ipAddress: request.ip,
      });
    return { id, isPublic: parsed.data.isPublic };
  });
}
