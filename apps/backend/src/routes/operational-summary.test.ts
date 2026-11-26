import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { registerOperationalSummaryRoutes } from './operational-summary.js';

const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE services(id INTEGER PRIMARY KEY); CREATE TABLE service_incidents(id INTEGER,service_id INTEGER,started_at INTEGER,ended_at INTEGER);',
);
const app = Fastify();
registerOperationalSummaryRoutes(app, db);
afterEach(async () => {
  await app.close();
  db.close();
});

it('accepts only supported ranges and rejects unknown query fields', async () => {
  expect((await app.inject('/api/operational-summary?range=7d')).statusCode).toBe(200);
  expect((await app.inject('/api/operational-summary?range=30d')).statusCode).toBe(400);
  expect((await app.inject('/api/operational-summary?range=24h&extra=1')).statusCode).toBe(400);
});
