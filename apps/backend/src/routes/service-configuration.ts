import type { FastifyInstance } from 'fastify';
import { ServiceValidationError, UPTIME_RANGES, type UptimeRange } from '@homora/shared';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import type { createObservationStore } from '../service-observations.js';
import {
  groupColumnsSchema,
  groupNameSchema,
  groupOrderSchema,
  parseId,
  serviceInputSchema,
  serviceDefaultsSchema,
  serviceOrderSchema,
} from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createPublicStatus } from '../public-status.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;
type Observations = ReturnType<typeof createObservationStore>;
const publicService = <T extends { allowPrivate: number | boolean }>(row: T) => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
});

export function registerServiceConfigurationRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
  observations: Observations,
  publicStatus: ReturnType<typeof createPublicStatus>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  app.get('/api/services', async () => {
    const shared = publicStatus.publicIds();
    return configuration.listServices().map((row) => ({ ...row, isPublic: shared.has(row.id) }));
  });
  app.get('/api/service-defaults', async () => ({
    allowPrivate: configuration.newServicesAllowPrivate(),
  }));
  app.put('/api/service-defaults', async (request, reply) => {
    const parsed = serviceDefaultsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const before = configuration.newServicesAllowPrivate();
    configuration.setNewServicesAllowPrivate(parsed.data.allowPrivate);
    if (before !== parsed.data.allowPrivate) {
      const session = await auth.session(request.headers);
      audit.record({
        actor: session ? `user:${session.userId}` : 'user:unknown',
        action: 'service-defaults-update',
        result: 'ok',
        detail: parsed.data.allowPrivate ? 'allow-private:on' : 'allow-private:off',
        ipAddress: request.ip,
      });
    }
    return { allowPrivate: parsed.data.allowPrivate };
  });
  app.get('/api/service-status', async () => monitor.snapshot());
  app.get<{ Params: { id: string } }>('/api/services/:id/status-detail', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    try {
      return observations.detail(id);
    } catch {
      return reply.code(404).send(errorBody('service-not-found'));
    }
  });
  const rangeOf = (value: unknown): UptimeRange | null =>
    value === undefined ? '24h' : (UPTIME_RANGES.find((range) => range === value) ?? null);
  app.get<{ Querystring: { range?: string } }>('/api/services/uptime', async (request, reply) => {
    const range = rangeOf(request.query.range);
    if (!range) return reply.code(400).send(errorBody('invalid-query'));
    // Pre-serialized and shared: a large inventory would otherwise be copied once per request.
    return reply.type('application/json; charset=utf-8').send(await observations.uptimeBody(range));
  });
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    '/api/services/:id/uptime',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const range = rangeOf(request.query.range);
      if (!range) return reply.code(400).send(errorBody('invalid-query'));
      const summary = id === null ? undefined : observations.uptime(range, Date.now(), id)[id];
      return summary ?? reply.code(404).send(errorBody('service-not-found'));
    },
  );
  app.get('/api/groups', async () => configuration.listGroups());

  app.post('/api/groups', async (request, reply) => {
    const parsed = groupNameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-name'));
    try {
      return reply.code(201).send(configuration.createGroup(parsed.data.name));
    } catch {
      return reply.code(409).send(errorBody('group-exists'));
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const parsed = groupNameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-name'));
    try {
      const updated = configuration.renameGroup(id, parsed.data.name);
      return updated ?? reply.code(404).send(errorBody('group-not-found'));
    } catch {
      return reply.code(409).send(errorBody('group-exists'));
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id/columns', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const parsed = groupColumnsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-columns'));
    return (
      configuration.setGroupColumns(id, parsed.data.columns) ??
      reply.code(404).send(errorBody('group-not-found'))
    );
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('group-not-found'));
    const result = configuration.deleteGroup(id);
    if (result === 'missing') return reply.code(404).send(errorBody('group-not-found'));
    if (result === 'not-empty') return reply.code(409).send(errorBody('group-not-empty'));
    return { deleted: true };
  });

  app.put('/api/groups/order', async (request, reply) => {
    const parsed = groupOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-group-order'));
    return configuration.reorderGroups(parsed.data.names)
      ? { ok: true }
      : reply.code(400).send(errorBody('invalid-group-order'));
  });

  app.put('/api/services/order', async (request, reply) => {
    const parsed = serviceOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-card-order'));
    return configuration.reorderServices(parsed.data.category, parsed.data.ids)
      ? { ok: true }
      : reply.code(400).send(errorBody('invalid-card-order'));
  });

  app.post('/api/services', async (request, reply) => {
    const parsed = serviceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      // Only the UI create path applies the instance default, and only when the form sent no value.
      const created = configuration.createService({
        ...parsed.data,
        allowPrivate: parsed.data.allowPrivate ?? configuration.newServicesAllowPrivate(),
      });
      void monitor.invalidate();
      return reply.code(201).send(publicService(created));
    } catch (error) {
      return reply
        .code(400)
        .send(errorBody(error instanceof ServiceValidationError ? error.code : 'invalid-data'));
    }
  });

  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = serviceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const updated = configuration.updateService(id, parsed.data);
      if (!updated) return reply.code(404).send(errorBody('service-not-found'));
      void monitor.invalidate();
      return publicService(updated);
    } catch (error) {
      return reply
        .code(400)
        .send(errorBody(error instanceof ServiceValidationError ? error.code : 'invalid-data'));
    }
  });

  app.delete<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ deleted: false });
    const deleted = configuration.deleteService(id);
    if (deleted) void monitor.invalidate();
    return reply.code(deleted ? 200 : 404).send({ deleted });
  });
}
