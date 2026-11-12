import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { COOLIFY_UUID_PATTERN } from '@homora/shared';
import { createResourceLinks, ResourceLinkError } from '../resource-links.js';
import { parseId } from '../input-schemas.js';
import { errorBody } from '../api-error.js';
import type { createAuth } from '../auth.js';
import type { AuditLog } from '../audit.js';

const httpUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  });
const bodySchema = z
  .object({
    integrationId: z.number().int().safe().positive(),
    resourceUuid: z.string().regex(COOLIFY_UUID_PATTERN),
    resourceType: z.enum(['application', 'service']),
    name: z.string().trim().min(1).max(200),
    url: httpUrl.nullable(),
  })
  .strict();

/**
 * Links between cards and Coolify resources. Session required (the `/api/` hook); every change is
 * audited with ids only. Nothing here writes to Coolify, and Coolify data never rewrites a card:
 * setting the link again is how the user accepts a reviewed change.
 */
export function registerResourceLinkRoutes(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  const links = createResourceLinks(sqlite);
  const record = async (request: FastifyRequest, action: string, detail: string) => {
    const session = await auth.session(request.headers);
    audit.record({
      actor: session ? `user:${session.userId}` : 'user:unknown',
      action,
      result: 'ok',
      detail,
      ipAddress: request.ip,
    });
  };
  app.get('/api/resource-links', async () => links.list());
  app.put<{ Params: { id: string } }>('/api/services/:id/resource-link', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const link = links.set(id, parsed.data);
      await record(request, 'resource-link-set', `service:${id} connection:${link.integrationId}`);
      return link;
    } catch (error) {
      if (!(error instanceof ResourceLinkError)) throw error;
      return reply.code(error.code === 'invalid-data' ? 400 : 404).send(errorBody(error.code));
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/api/services/:id/resource-link',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('service-not-found'));
      if (!links.remove(id)) return reply.code(404).send(errorBody('resource-link-not-found'));
      await record(request, 'resource-link-remove', `service:${id}`);
      return { ok: true };
    },
  );
}
