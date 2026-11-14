import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProbeValidationError } from '@homora/shared';
import { errorBody } from '../api-error.js';
import type { AuditLog } from '../audit.js';
import type { createAuth } from '../auth.js';
import { parseId } from '../input-schemas.js';
import type { createServiceMonitor } from '../monitoring/index.js';
import type { ProbeStore } from '../probes.js';

const probeSchema = z
  .object({
    name: z.string().max(200),
    address: z.string().max(2100),
    checkType: z.string().max(20).optional(),
    checkInterval: z.number().int().safe().nullable().optional(),
    expectedStatus: z
      .union([z.string().max(10), z.number().int()])
      .nullable()
      .optional(),
    checkMatch: z.string().max(400).nullable().optional(),
    allowPrivate: z.boolean().optional(),
  })
  .strict();

export function registerProbeRoutes(
  app: FastifyInstance,
  probes: ProbeStore,
  monitor: ReturnType<typeof createServiceMonitor>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  const record = async (
    request: { headers: Parameters<typeof auth.session>[0]; ip: string },
    action: 'probe-create' | 'probe-update' | 'probe-delete',
    id: number,
  ) => {
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action,
      result: 'ok',
      detail: `probe:${id}`,
      ipAddress: request.ip,
    });
  };
  const invalid = (error: unknown) =>
    error instanceof ProbeValidationError
      ? errorBody(`invalid-probe-${error.code.slice('invalid-'.length)}` as 'invalid-probe-name')
      : errorBody('invalid-data');

  app.get('/api/probes', async () => probes.list());
  app.post('/api/probes', async (request, reply) => {
    const parsed = probeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const created = probes.create(parsed.data as Parameters<ProbeStore['create']>[0]);
      void monitor.invalidate();
      await record(request, 'probe-create', created.id);
      return reply.code(201).send(created);
    } catch (error) {
      return reply.code(400).send(invalid(error));
    }
  });
  app.put<{ Params: { id: string } }>('/api/probes/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('probe-not-found'));
    const parsed = probeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const updated = probes.update(id, parsed.data as Parameters<ProbeStore['update']>[1]);
      if (!updated) return reply.code(404).send(errorBody('probe-not-found'));
      void monitor.invalidate();
      await record(request, 'probe-update', id);
      return updated;
    } catch (error) {
      return reply.code(400).send(invalid(error));
    }
  });
  app.delete<{ Params: { id: string } }>('/api/probes/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null || !probes.remove(id))
      return reply.code(404).send(errorBody('probe-not-found'));
    void monitor.invalidate();
    await record(request, 'probe-delete', id);
    return reply.code(204).send();
  });
}
