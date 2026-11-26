/** Reproducible local read benchmark: `pnpm --filter @homora/backend exec tsx bench/operational-summary.ts`.
 * Uses an isolated in-memory SQLite database and synthetic incident events only.
 */
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import Fastify from 'fastify';
import { registerOperationalSummaryRoutes } from '../src/routes/operational-summary.js';

const db = new DatabaseSync(':memory:');
const app = Fastify();
registerOperationalSummaryRoutes(app, db);
try {
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY,service_id INTEGER,started_at INTEGER,ended_at INTEGER);
    CREATE INDEX service_incidents_started_idx ON service_incidents(started_at);
    INSERT INTO services VALUES(1);`);
  const insert = db.prepare('INSERT INTO service_incidents VALUES(?,?,?,?)');
  const now = Date.now();
  db.exec('BEGIN');
  for (let i = 1; i <= 50_000; i++) {
    const at = now - (i % 30) * 86_400_000 - i * 100;
    insert.run(i, 1, at, at + 30_000);
  }
  db.exec('COMMIT');
  for (const range of ['24h', '7d'] as const) {
    const elapsed: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      const response = await app.inject(`/api/operational-summary?range=${range}`);
      if (response.statusCode !== 200) throw new Error(`Unexpected status: ${response.statusCode}`);
      elapsed.push(performance.now() - start);
    }
    elapsed.sort((a, b) => a - b);
    const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1]!;
    console.log(
      `${range}: HTTP injection p95 ${p95.toFixed(2)} ms, 30 calls, 50,000 synthetic incident rows`,
    );
    if (p95 >= 300) process.exitCode = 1;
  }
} finally {
  await app.close();
  db.close();
}
