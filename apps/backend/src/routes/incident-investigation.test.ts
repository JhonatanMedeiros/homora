import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { registerIncidentInvestigationRoutes } from './incident-investigation.js';

it('rejects unknown queries and returns not found for unknown incidents', async () => {
  const db = new DatabaseSync(':memory:');
  const app = Fastify();
  db.exec(
    'CREATE TABLE monitors(id INTEGER PRIMARY KEY); CREATE TABLE services(id INTEGER PRIMARY KEY); CREATE TABLE service_incidents(id INTEGER PRIMARY KEY, service_id INTEGER, started_at INTEGER, ended_at INTEGER); CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,observed_at INTEGER,observation TEXT);',
  );
  registerIncidentInvestigationRoutes(app, db);
  try {
    expect((await app.inject('/api/incidents/1/investigation?extra=1')).statusCode).toBe(400);
    expect((await app.inject('/api/incidents/1/investigation')).statusCode).toBe(404);
    expect((await app.inject('/api/incidents/invalid/investigation')).statusCode).toBe(404);
  } finally {
    await app.close();
    db.close();
  }
});
