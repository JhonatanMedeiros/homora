import type { FastifyInstance } from 'fastify';
import { ServiceValidationError } from '@homora/shared';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import {
  groupNameSchema,
  groupOrderSchema,
  parseId,
  serviceInputSchema,
  serviceOrderSchema,
} from '../input-schemas.js';
import { errorBody } from '../api-error.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;
const publicService = <T extends { allowPrivate: number | boolean }>(row: T) => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
});

export function registerServiceConfigurationRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
) {
  app.get('/api/services', async () => configuration.listServices());
  app.get('/api/service-status', async () => monitor.snapshot());
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
      const created = configuration.createService(parsed.data);
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
