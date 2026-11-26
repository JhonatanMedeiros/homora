import type { FastifyInstance } from 'fastify';
import type {
  createIncidentStore,
  createMeasurementGuard,
  createObservationStore,
} from '../monitoring/index.js';
import { errorBody } from '../api-error.js';
import {
  incidentQuerySchema,
  latencyQuerySchema,
  monitorSettingsSchema,
  parseId,
} from '../input-schemas.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

/** Incidents, the banner numbers and the per-service alert thresholds (never touched by imports or agents). */
export function registerServiceIncidentRoutes(
  app: FastifyInstance,
  incidents: ReturnType<typeof createIncidentStore>,
  observations: ReturnType<typeof createObservationStore>,
  measurement: Pick<ReturnType<typeof createMeasurementGuard>, 'current'>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  app.get('/api/status-overview', async () => {
    const open = measurement.current();
    return {
      ...incidents.overview(() => observations.uptime('30d')),
      // Never cached with the rest: it must show up and clear as soon as it happens.
      measurement: open
        ? {
            startedAt: open.startedAt,
            reason: open.reason,
            failing: open.failing,
            measured: open.measured,
          }
        : null,
    };
  });
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
  app.get<{ Params: { id: string; incidentId: string } }>(
    '/api/services/:id/incidents/:incidentId',
    async (request, reply) => {
      const serviceId = parseId(request.params.id);
      const incidentId = parseId(request.params.incidentId);
      if (serviceId === null || incidentId === null)
        return reply.code(404).send(errorBody('not-found'));
      const incident = incidents.find(serviceId, incidentId);
      if (!incident) return reply.code(404).send(errorBody('not-found'));
      return incident;
    },
  );
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/services/:id/latency',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const query = latencyQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      if (id === null || !incidents.serviceExists(id))
        return reply.code(404).send(errorBody('service-not-found'));
      return observations.latency(id, query.data.range ?? '24h');
    },
  );
  app.get<{ Params: { id: string } }>('/api/services/:id/insights', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null || !incidents.serviceExists(id))
      return reply.code(404).send(errorBody('service-not-found'));
    return observations.insights(id);
  });
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
