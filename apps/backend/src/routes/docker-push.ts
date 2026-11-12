import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorBody } from '../api-error.js';
import { parseDocker } from '../docker-discovery.js';
import type { createDockerPush } from '../docker-push.js';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const idSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
const importSchema = z
  .object({
    ids: z
      .array(z.string().regex(/^[a-f0-9]{12}$/))
      .min(1)
      .max(200),
    inventoryVersion: z.number().int().safe().positive(),
    expectedVersion: z.number().int().safe().nonnegative(),
    keepPrivate: z.boolean().optional(),
  })
  .strict();

export function registerDockerPushRoutes(
  app: FastifyInstance,
  push: ReturnType<typeof createDockerPush>,
  configuration: ReturnType<typeof createServiceConfiguration>,
  monitor: ReturnType<typeof createServiceMonitor>,
) {
  app.get('/api/discovery/sources', async () => ({ sources: push.list() }));
  app.post('/api/discovery/sources', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const source = push.create(body.data.name);
      if (!source) return reply.code(409).send(errorBody('invalid-data'));
      return reply.code(201).send(source);
    } catch {
      return reply.code(409).send(errorBody('invalid-data'));
    }
  });
  app.post('/api/discovery/sources/:id/rotate', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const token = push.rotate(params.data.id);
    return token ? { token } : reply.code(404).send(errorBody('not-found'));
  });
  app.delete('/api/discovery/sources/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    if (!push.revoke(params.data.id)) return reply.code(404).send(errorBody('not-found'));
    return reply.code(204).send();
  });
  app.delete('/api/discovery/sources/:id/remove', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    if (!push.remove(params.data.id)) return reply.code(404).send(errorBody('not-found'));
    return reply.code(204).send();
  });
  app.get('/api/discovery/sources/:id/suggestions', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const source = push.snapshot(params.data.id);
    if (!source) return reply.code(409).send(errorBody('discovery-stale'));
    const { parsed, entries, scanned } = parseDocker(source.containers);
    return {
      source: {
        id: source.id,
        name: source.name,
        receivedAt: source.receivedAt,
        version: source.version,
      },
      entries,
      scanned,
      ...configuration.previewImport(parsed),
    };
  });
  app.post('/api/discovery/sources/:id/import', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    const body = importSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send(errorBody('invalid-data'));
    const source = push.snapshot(params.data.id);
    if (!source || source.version !== body.data.inventoryVersion)
      return reply.code(409).send(errorBody('discovery-stale'));
    const selected = new Set(body.data.ids);
    const { parsed, entries } = parseDocker(source.containers, selected);
    if (entries.length !== selected.size) return reply.code(409).send(errorBody('discovery-stale'));
    const result = configuration.applyImport(parsed, {
      keepPrivate: false,
      grantPrivate: body.data.keepPrivate === true,
      expectedVersion: body.data.expectedVersion,
      guard: () => push.isCurrent(params.data.id, body.data.inventoryVersion),
    });
    if (result.status === 'stale') return reply.code(409).send(errorBody('config-changed'));
    void monitor.invalidate();
    return { created: result.created, plan: result.plan };
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.post(
    '/docker-push/inventory',
    {
      bodyLimit: 1024 * 1024,
      onRequest: async (request, reply) => {
        if (request.headers.origin) return reply.code(403).send(errorBody('origin-not-allowed'));
        const now = Date.now();
        for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
        if (!attempts.has(request.ip) && attempts.size >= 10000)
          return reply.code(429).send(errorBody('too-many-attempts'));
        const entry = attempts.get(request.ip) ?? { count: 0, until: now + 60000 };
        entry.count++;
        attempts.set(request.ip, entry);
        if (entry.count > 60) return reply.code(429).send(errorBody('too-many-attempts'));
      },
    },
    async (request, reply) => {
      const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '')?.[1] ?? '';
      const result = push.ingest(token, request.body);
      if (result === 'unauthorized') return reply.code(401).send(errorBody('auth-required'));
      if (result === 'invalid') return reply.code(400).send(errorBody('invalid-data'));
      return reply.code(204).send();
    },
  );
}
