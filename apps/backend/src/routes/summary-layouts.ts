import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';
import { createSummaryLayouts } from '../summary-layouts.js';

const bodySchema = z
  .object({
    revision: z.number().int().safe().min(0),
    desktop: z.unknown(),
    phone: z.unknown(),
    add: z
      .array(z.object({ id: z.number().int() }).passthrough())
      .max(80)
      .optional(),
    remove: z.array(z.number().int().safe().positive()).max(80).optional(),
  })
  .strict();

const STATUS = {
  'page-not-found': 404,
  'invalid-summary-layout': 400,
  'summary-layout-conflict': 409,
  'widget-limit': 409,
} as const;

/** The Summary: read every page's arrangement and save one edit of it. */
export function registerSummaryLayoutRoutes(app: FastifyInstance, sqlite: DatabaseSync) {
  const layouts = createSummaryLayouts(sqlite);
  app.get('/api/summary-layouts', async () => layouts.list());
  app.put<{ Params: { id: string } }>('/api/pages/:id/summary-layout', async (request, reply) => {
    const pageId = parseId(request.params.id);
    const parsed = bodySchema.safeParse(request.body);
    if (pageId === null || !parsed.success)
      return reply.code(400).send(errorBody('invalid-summary-layout'));
    const result = layouts.save(pageId, parsed.data);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    return result.layout;
  });
}
