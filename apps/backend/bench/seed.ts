import type { DatabaseSync } from 'node:sqlite';
import { serviceSignature } from '../src/monitoring/index.js';

/* ---------------------------------------------------------------- bulk seeding */

export type SeedOptions = {
  services: number;
  groups: number;
  /** Total history rows spread over the last `historyDays` days. */
  historyRows: number;
  historyDays: number;
  /** Host:port used in service URLs; defaults to a loopback placeholder that is never contacted. */
  target?: { host: string; port: number };
  allowPrivate?: boolean;
  checkInterval?: number | null;
};

/** Seeds an open, migrated database directly with SQL; orders of magnitude faster than the API. */
export function seedDatabase(sqlite: DatabaseSync, options: SeedOptions) {
  const host = options.target?.host ?? '127.0.0.1';
  const port = options.target?.port ?? 18000;
  sqlite.exec('BEGIN');
  const insertGroup = sqlite.prepare('INSERT INTO service_groups(name, position) VALUES (?, ?)');
  const insertService = sqlite.prepare(
    'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  for (let g = 0; g < options.groups; g++) insertGroup.run(`Group ${g}`, g);
  const rows: { id: number; signature: string }[] = [];
  for (let i = 0; i < options.services; i++) {
    const url = `http://${host}:${port}/svc/${i}`;
    const allowPrivate = options.allowPrivate ? 1 : 0;
    const result = insertService.run(
      `Service ${i}`,
      url,
      `Group ${i % options.groups}`,
      `Benchmark service number ${i}`,
      'brand:nextcloud',
      Math.floor(i / options.groups),
      allowPrivate,
      'http',
      options.checkInterval ?? null,
    );
    rows.push({
      id: Number(result.lastInsertRowid),
      signature: serviceSignature({
        url,
        allowPrivate: Boolean(allowPrivate),
        checkType: 'http',
        checkInterval: options.checkInterval ?? null,
        expectedStatus: null,
        checkPath: null,
      }),
    });
  }
  sqlite.exec('COMMIT');
  if (options.historyRows > 0 && rows.length > 0) {
    const insert = sqlite.prepare(
      'INSERT OR IGNORE INTO service_observation_history(service_id,signature,observed_at,observation) VALUES (?,?,?,?)',
    );
    const now = Date.now();
    const span = options.historyDays * 86_400_000;
    const perService = Math.ceil(options.historyRows / rows.length);
    const step = Math.max(1, Math.floor(span / perService));
    let batch = 0;
    sqlite.exec('BEGIN');
    for (const row of rows) {
      for (let k = 0; k < perService; k++) {
        const observedAt = now - k * step - Math.floor(Math.random() * Math.max(1, step / 2));
        const down = Math.random() < 0.03;
        const observation = JSON.stringify({
          status: down ? 'unavailable' : 'available',
          lastAttempt: new Date(observedAt).toISOString(),
          reason: down ? 'no-response' : 'responding',
          httpStatus: down ? null : 200,
          latencyMs: down ? null : 5 + Math.floor(Math.random() * 120),
        });
        insert.run(row.id, row.signature, observedAt, observation);
        if (++batch % 200_000 === 0) {
          sqlite.exec('COMMIT');
          sqlite.exec('BEGIN');
        }
      }
    }
    sqlite.exec('COMMIT');
  }
  return rows;
}
