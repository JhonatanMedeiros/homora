import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorBody, sendSanitizedError } from '../api-error.js';
import { createIpRateLimiter } from '../rate-limit.js';
import {
  fingerprintReview,
  importResults,
  overridesSchema,
  parseDocker,
  toOverrides,
} from '../discovery/index.js';
import type { createDockerPush } from '../discovery/index.js';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../monitoring/index.js';
import type { createAuth } from '../auth.js';

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
    overrides: overridesSchema,
    preview: z.boolean().optional(),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export function registerDockerPushRoutes(
  app: FastifyInstance,
  push: ReturnType<typeof createDockerPush>,
  configuration: ReturnType<typeof createServiceConfiguration>,
  monitor: ReturnType<typeof createServiceMonitor>,
  auth: ReturnType<typeof createAuth>,
) {
  const actor = async (request: { headers: Parameters<typeof auth.session>[0]; ip: string }) => {
    const session = await auth.session(request.headers);
    return session ? { id: `user:${session.userId}`, ipAddress: request.ip } : null;
  };
  app.get('/api/discovery/sources', async () => ({ sources: push.list() }));
  app.post('/api/discovery/sources', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-data'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    try {
      const source = push.create(body.data.name, who);
      if (!source) return reply.code(409).send(errorBody('source-limit'));
      return reply.code(201).send(source);
    } catch (error) {
      if ((error as { errcode?: number }).errcode === 2067)
        return reply.code(409).send(errorBody('invalid-data'));
      throw error;
    }
  });
  app.post('/api/discovery/sources/:id/rotate', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    const token = push.rotate(params.data.id, who);
    return token ? { token } : reply.code(404).send(errorBody('not-found'));
  });
  app.post('/api/discovery/sources/:id/revoke', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    if (!push.revoke(params.data.id, who)) return reply.code(404).send(errorBody('not-found'));
    return reply.code(204).send();
  });
  app.delete('/api/discovery/sources/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const who = await actor(request);
    if (!who) return reply.code(401).send(errorBody('auth-required'));
    if (!push.remove(params.data.id, who)) return reply.code(404).send(errorBody('not-found'));
    return reply.code(204).send();
  });
  app.get('/api/discovery/sources/:id/suggestions', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorBody('invalid-data'));
    const source = push.snapshot(params.data.id);
    if (!source) return reply.code(409).send(errorBody('discovery-stale'));
    const { parsed, entries, scanned, skipped, skippedTotal, rejected } = parseDocker(
      source.containers,
    );
    return {
      source: {
        id: source.id,
        name: source.name,
        receivedAt: source.receivedAt,
        version: source.version,
      },
      entries,
      scanned,
      skipped,
      skippedTotal,
      rejected,
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
    const ids = [...new Set(body.data.ids)];
    const selected = new Set(ids);
    const { parsed, entries, rejected } = parseDocker(
      source.containers,
      selected,
      toOverrides(body.data.overrides),
    );
    if (entries.length + rejected.length !== selected.size)
      return reply.code(409).send(errorBody('discovery-stale'));
    const digest = fingerprintReview(parsed);
    if (body.data.preview) {
      const review = configuration.previewImport(parsed);
      return {
        ...review,
        fingerprint: digest,
        results: importResults(ids, entries, rejected, review.plan),
      };
    }
    if (body.data.fingerprint !== undefined && body.data.fingerprint !== digest)
      return reply.code(409).send(errorBody('discovery-stale'));
    const result = configuration.applyImport(parsed, {
      keepPrivate: false,
      grantPrivate: body.data.keepPrivate === true,
      expectedVersion: body.data.expectedVersion,
      guard: () => push.isCurrent(params.data.id, body.data.inventoryVersion),
    });
    if (result.status === 'stale') return reply.code(409).send(errorBody('config-changed'));
    void monitor.invalidate();
    return {
      created: result.created,
      plan: result.plan,
      results: importResults(ids, entries, rejected, result.plan),
    };
  });
  const allowIp = createIpRateLimiter({ max: 60 });
  app.post(
    '/docker-push/inventory',
    {
      bodyLimit: 1024 * 1024,
      errorHandler: (error, request, reply) => {
        if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
          return reply.code(413).send(errorBody('inventory-too-large'));
        return sendSanitizedError(error, request, reply);
      },
      onRequest: async (request, reply) => {
        if (request.headers.origin) return reply.code(403).send(errorBody('origin-not-allowed'));
        if (!allowIp(request.ip)) return reply.code(429).send(errorBody('too-many-attempts'));
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
          return reply.code(415).send(errorBody('invalid-data'));
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
