import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { monitoringCoverage } from '../monitoring/index.js';

export function registerMonitoringCoverageRoutes(app: FastifyInstance, db: DatabaseSync) {
  app.get('/api/monitoring/coverage', async () => monitoringCoverage(db));
}
