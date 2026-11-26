/** Synthetic, in-memory endpoint benchmark: pnpm --filter @homora/backend exec tsx bench/incident-investigation.ts */
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import Fastify from 'fastify';
import { registerIncidentInvestigationRoutes } from '../src/routes/incident-investigation.js';

const db = new DatabaseSync(':memory:');
const app = Fastify();
registerIncidentInvestigationRoutes(app, db);
try {
  db.exec(`CREATE TABLE monitors(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE services(id INTEGER PRIMARY KEY);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY,service_id INTEGER,started_at INTEGER,ended_at INTEGER);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT);
    CREATE INDEX service_incidents_started_idx ON service_incidents(started_at);
    CREATE UNIQUE INDEX observation_history_service_time_idx ON service_observation_history(service_id,observed_at,signature);
    INSERT INTO monitors VALUES(1,'Synthetic A'),(2,'Synthetic B'); INSERT INTO services VALUES(1);`);
  const now = Date.now();
  const incident = db.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
  const observation = db.prepare('INSERT INTO service_observation_history VALUES(?,?,?,?,?)');
  db.exec('BEGIN');
  incident.run(1, 1, now - 60 * 60_000, now - 30 * 60_000);
  for (let i = 2; i <= 50_000; i++) {
    const at = now - (i % 30) * 86_400_000 - i * 100;
    incident.run(i, 2, at, at + 30_000);
    observation.run(i, 1, 'synthetic', now - i * 60_000, '{"status":"unavailable"}');
  }
  db.exec('COMMIT');
  const elapsed: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    const response = await app.inject('/api/incidents/1/investigation');
    if (response.statusCode !== 200) throw new Error(`Unexpected status: ${response.statusCode}`);
    elapsed.push(performance.now() - start);
  }
  elapsed.sort((a, b) => a - b);
  const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1]!;
  console.log(
    `HTTP injection p95 ${p95.toFixed(2)} ms; 30 calls, 50,000 incidents and 49,999 observations`,
  );
  if (p95 >= 300) process.exitCode = 1;
} finally {
  await app.close();
  db.close();
}
