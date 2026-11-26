import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';
import { investigateIncident } from '../monitoring/index.js';

export function registerIncidentInvestigationRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get<{ Params: { id: string } }>(
    '/api/incidents/:id/investigation',
    async (request, reply) => {
      const id = parseId(request.params.id);
      const result = id === null ? null : investigateIncident(db, id);
      if (result === null) return reply.code(404).send(errorBody('not-found'));
      return result;
    },
  );
}
