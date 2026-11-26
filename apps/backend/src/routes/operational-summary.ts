import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorBody } from '../api-error.js';
import { operationalSummary } from '../monitoring/index.js';

const querySchema = z.object({ range: z.enum(['24h', '7d']).default('24h') }).strict();

export function registerOperationalSummaryRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get('/api/operational-summary', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
    return operationalSummary(db, query.data.range);
  });
}
