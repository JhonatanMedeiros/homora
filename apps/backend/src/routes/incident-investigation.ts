import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';
import { investigateIncident } from '../monitoring/index.js';

const emptyQuery = z.object({}).strict();

export function registerIncidentInvestigationRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get<{ Params: { id: string } }>(
    '/api/incidents/:id/investigation',
    async (request, reply) => {
      if (!emptyQuery.safeParse(request.query).success)
        return reply.code(400).send(errorBody('invalid-query'));
      const id = parseId(request.params.id);
      const result = id === null ? null : investigateIncident(db, id);
      if (result === null) return reply.code(404).send(errorBody('not-found'));
      return result;
    },
  );
}
