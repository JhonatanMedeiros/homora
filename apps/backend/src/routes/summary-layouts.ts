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
  })
  .strict();

const STATUS = {
  'page-not-found': 404,
  'invalid-summary-layout': 400,
  'summary-layout-conflict': 409,
} as const;

/** The customized Summary: read every page's layout and replace one of them. */
export function registerSummaryLayoutRoutes(app: FastifyInstance, sqlite: DatabaseSync) {
  const layouts = createSummaryLayouts(sqlite);
  app.get('/api/summary-layouts', async () => layouts.list());
  app.put<{ Params: { id: string } }>('/api/pages/:id/summary-layout', async (request, reply) => {
    const pageId = parseId(request.params.id);
    const parsed = bodySchema.safeParse(request.body);
    if (pageId === null || !parsed.success)
      return reply.code(400).send(errorBody('invalid-summary-layout'));
    const { revision, desktop, phone } = parsed.data;
    const result = layouts.save(pageId, revision, { desktop, phone });
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    return result.layout;
  });
}
