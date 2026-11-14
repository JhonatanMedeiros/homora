import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';
import { errorBody } from '../api-error.js';
import type { createMonitoringTrustStore } from '../monitoring/index.js';
import type { createServiceMonitor } from '../monitoring/index.js';

const bodySchema = z.object({ bundle: z.string().max(65_536) }).strict();

export function registerMonitoringTrustRoutes(
  app: FastifyInstance,
  store: ReturnType<typeof createMonitoringTrustStore>,
  monitor: ReturnType<typeof createServiceMonitor>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  app.get('/api/monitoring/trust', async () => {
    const { trust, invalid } = store.read();
    return { certificates: trust?.certificates ?? [], invalid };
  });
  app.put('/api/monitoring/trust', async (request, reply) => {
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-ca'));
    let trust;
    try {
      trust = store.set(parsed.data.bundle);
    } catch {
      return reply.code(400).send(errorBody('invalid-ca'));
    }
    audit.record({
      actor: `user:${session.userId}`,
      action: 'monitoring-ca-update',
      result: 'ok',
      detail: `certificates:${trust.certificates.length}`,
      ipAddress: request.ip,
    });
    void monitor.invalidate();
    return { certificates: trust.certificates, invalid: false };
  });
  app.delete('/api/monitoring/trust', async (request, reply) => {
    const session = await auth.session(request.headers);
    if (!session) return reply.code(401).send(errorBody('auth-required'));
    store.remove();
    audit.record({
      actor: `user:${session.userId}`,
      action: 'monitoring-ca-update',
      result: 'ok',
      detail: 'removed',
      ipAddress: request.ip,
    });
    void monitor.invalidate();
    return { certificates: [], invalid: false };
  });
}
