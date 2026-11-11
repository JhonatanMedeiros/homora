import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import { InputError, errorBody } from '../api-error.js';
import { parseDocker, type DockerSource } from '../docker-discovery.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;

const importSchema = z
  .object({
    ids: z
      .array(z.string().regex(/^[0-9a-f]{12}$/))
      .min(1)
      .max(200),
    keepPrivate: z.boolean().optional(),
    expectedVersion: z.number().int().safe().nonnegative().optional(),
  })
  .strict();

/**
 * Docker discovery: `GET` lists suggestions from container labels (without persisting anything)
 * and `POST` imports only selected containers, re-reading Docker on the server. The browser
 * never submits card payloads, only container IDs. New cards do not receive private network
 * permissions unless explicitly opted-in during review.
 */
export function registerDiscoveryRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
  docker: DockerSource | undefined,
) {
  app.get('/api/discovery', async (_request, reply) => {
    if (!docker) return { enabled: false };
    try {
      const { parsed, entries, scanned } = parseDocker(await docker.list());
      const preview = configuration.previewImport(parsed);
      return { enabled: true, scanned, entries, ...preview };
    } catch (error) {
      if (error instanceof InputError) return reply.code(502).send(errorBody(error.code));
      return reply.code(502).send(errorBody('docker-unavailable'));
    }
  });

  app.post('/api/discovery/import', async (request, reply) => {
    if (!docker) return reply.code(404).send(errorBody('discovery-disabled'));
    const body = importSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
    let containers;
    try {
      containers = await docker.list();
    } catch (error) {
      if (error instanceof InputError) return reply.code(502).send(errorBody(error.code));
      return reply.code(502).send(errorBody('docker-unavailable'));
    }
    const { parsed } = parseDocker(containers, new Set(body.data.ids));
    const result = configuration.applyImport(parsed, {
      keepPrivate: false,
      expectedVersion: body.data.expectedVersion,
      grantPrivate: body.data.keepPrivate === true,
    });
    if (result.status === 'stale') return reply.code(409).send(errorBody('config-changed'));
    void monitor.invalidate();
    return { created: result.created, plan: result.plan };
  });
}
