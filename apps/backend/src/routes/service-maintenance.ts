import type { FastifyInstance } from 'fastify';
import type { MaintenanceOverview } from '@homora/shared';
import { errorBody } from '../api-error.js';
import { maintenanceSchema, parseId } from '../input-schemas.js';
import { MaintenanceError, type createMaintenanceStore } from '../monitoring/index.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

/** Scheduled maintenance windows: list, schedule and cancel. The monitor reads them on its next cycle. */
export function registerServiceMaintenanceRoutes(
  app: FastifyInstance,
  maintenance: ReturnType<typeof createMaintenanceStore>,
  monitor: { invalidate: () => Promise<void> | void },
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  const actor = async (headers: Record<string, unknown>) => {
    const session = await auth.session(headers as never);
    return session ? `user:${session.userId}` : 'user:unknown';
  };
  app.get('/api/maintenance', async (): Promise<MaintenanceOverview> => ({
    windows: maintenance.upcoming(),
  }));
  app.get<{ Params: { id: string } }>('/api/services/:id/maintenance', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    return { windows: maintenance.ofService(id) };
  });
  app.post<{ Params: { id: string } }>('/api/services/:id/maintenance', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = maintenanceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const created = maintenance.create(id, parsed.data);
      audit.record({
        actor: await actor(request.headers),
        action: 'service-maintenance-create',
        result: 'ok',
        detail: `${id}:${new Date(created.startsAt).toISOString()}/${new Date(created.endsAt).toISOString()}`,
        ipAddress: request.ip,
      });
      void monitor.invalidate();
      return reply.code(201).send(created);
    } catch (error) {
      if (error instanceof MaintenanceError)
        return reply
          .code(error.code === 'service-not-found' ? 404 : error.code === 'overlap' ? 409 : 400)
          .send(
            errorBody(
              error.code === 'overlap'
                ? 'maintenance-overlap'
                : error.code === 'service-not-found'
                  ? 'service-not-found'
                  : 'invalid-data',
            ),
          );
      throw error;
    }
  });
  app.delete<{ Params: { id: string } }>('/api/maintenance/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    const removed = id === null ? null : maintenance.remove(id);
    if (!removed) return reply.code(404).send(errorBody('maintenance-not-found'));
    audit.record({
      actor: await actor(request.headers),
      action: 'service-maintenance-delete',
      result: 'ok',
      detail: `${removed.serviceId}:${removed.id}`,
      ipAddress: request.ip,
    });
    void monitor.invalidate();
    return reply.code(204).send();
  });
}
