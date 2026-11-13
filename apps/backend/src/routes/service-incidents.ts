import type { FastifyInstance } from 'fastify';
import type { createIncidentStore } from '../service-incidents.js';
import type { createObservationStore } from '../service-observations.js';
import { errorBody } from '../api-error.js';
import { incidentQuerySchema, monitorSettingsSchema, parseId } from '../input-schemas.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

/** Incidents, the banner numbers and the per-service alert thresholds (never touched by imports or agents). */
export function registerServiceIncidentRoutes(
  app: FastifyInstance,
  incidents: ReturnType<typeof createIncidentStore>,
  observations: ReturnType<typeof createObservationStore>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  app.get('/api/status-overview', async () => incidents.overview(() => observations.uptime('30d')));
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/services/:id/incidents',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const query = incidentQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      if (id === null || !incidents.serviceExists(id))
        return reply.code(404).send(errorBody('service-not-found'));
      return incidents.list(id, query.data.limit, query.data.before);
    },
  );
  app.put<{ Params: { id: string } }>('/api/services/:id/monitoring', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null || !incidents.serviceExists(id))
      return reply.code(404).send(errorBody('service-not-found'));
    const parsed = monitorSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const before = incidents.settingsOf(id);
    incidents.setSettings(id, parsed.data);
    if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
      const session = await auth.session(request.headers);
      audit.record({
        actor: session ? `user:${session.userId}` : 'user:unknown',
        action: 'service-monitoring-update',
        result: 'ok',
        detail: `${id}:${parsed.data.failureThreshold}/${parsed.data.recoveryThreshold}/${parsed.data.degradedLatencyMs ?? 'off'}`,
        ipAddress: request.ip,
      });
    }
    return parsed.data;
  });
}
