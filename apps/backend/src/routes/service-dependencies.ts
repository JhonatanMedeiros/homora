import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { DependencyError, createServiceDependencies } from '../service-dependencies.js';
import { parseId } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

const bodySchema = z.object({ dependsOnId: z.number().int().safe().positive() }).strict();

/** Manual dependencies between cards. Session required (the `/api/` hook); every change is audited. */
export function registerServiceDependencyRoutes(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  const dependencies = createServiceDependencies(sqlite);
  const record = async (request: FastifyRequest, action: string, detail: string) => {
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action,
      result: 'ok',
      detail,
      ipAddress: request.ip,
    });
  };
  app.get('/api/service-dependencies', async () => dependencies.list());
  app.post<{ Params: { id: string } }>('/api/services/:id/dependencies', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const created = dependencies.add(id, parsed.data.dependsOnId);
      if (created)
        await record(
          request,
          'service-dependency-add',
          `service:${id}->${parsed.data.dependsOnId}`,
        );
      return reply
        .code(created ? 201 : 200)
        .send({ serviceId: id, dependsOnId: parsed.data.dependsOnId });
    } catch (error) {
      if (!(error instanceof DependencyError)) throw error;
      const status =
        error.code === 'service-not-found' ? 404 : error.code === 'dependency-cycle' ? 409 : 400;
      return reply.code(status).send(errorBody(error.code));
    }
  });
  app.delete<{ Params: { id: string; other: string } }>(
    '/api/services/:id/dependencies/:other',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const other = parseId(request.params.other);
      if (id === null || other === null) return reply.code(404).send({ deleted: false });
      const deleted = dependencies.remove(id, other);
      if (deleted) await record(request, 'service-dependency-remove', `service:${id}->${other}`);
      return reply.code(deleted ? 200 : 404).send({ deleted });
    },
  );
}
