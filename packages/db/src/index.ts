import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { embeddedMigrations } from './migrations.generated.js';
export {
  services,
  serviceGroups,
  pages,
  integrationInstances,
  integrationWidgets,
  agentIdentities,
  serviceProposals,
  configVersion,
  auditEvents,
} from './schema.js';
const sqliteHandles = new WeakMap<object, DatabaseSync>();
export function getSqliteHandle(db: object) {
  const handle = sqliteHandles.get(db);
  if (!handle) throw new Error('Database handle unavailable');
  return handle;
}

/** Same shape and hash as Drizzle's readMigrationFiles, read from the embedded copy. */
export function loadMigrations() {
  return embeddedMigrations.map((migration) => ({
    sql: migration.sql.split('--> statement-breakpoint'),
    bps: migration.breakpoints,
    folderMillis: migration.when,
    hash: createHash('sha256').update(migration.sql).digest('hex'),
  }));
}

/** Apply generated Drizzle migrations atomically, adopting only the known legacy schema. */
function migrate(sqlite: DatabaseSync) {
  const migrations = loadMigrations();
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    const applied = sqlite
      .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
      .all() as { hash: string; created_at: number }[];
    if (
      applied.length > migrations.length ||
      applied.some(
        (row, i) =>
          row.hash !== migrations[i]?.hash ||
          Number(row.created_at) !== migrations[i]?.folderMillis,
      )
    )
      throw new Error('Incompatible migration history.');
    const tableExists = !!sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'services'")
      .get();
    if (applied.length === 0 && tableExists) {
      const columns = sqlite.prepare('PRAGMA table_info(services)').all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      const expected = [
        ['id', 'INTEGER', 0, 1],
        ['name', 'TEXT', 1, 0],
        ['url', 'TEXT', 1, 0],
        ['category', 'TEXT', 1, 0],
        ['description', 'TEXT', 1, 0],
      ];
      if (
        columns.length !== expected.length ||
        columns.some(
          (c, i) =>
            c.name !== expected[i][0] ||
            c.type.toUpperCase() !== expected[i][1] ||
            c.notnull !== expected[i][2] ||
            c.pk !== expected[i][3],
        )
      )
        throw new Error('Incompatible existing schema; no data was modified.');
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(migrations[0].hash, migrations[0].folderMillis);
      applied.push({ hash: migrations[0].hash, created_at: migrations[0].folderMillis });
    }
    for (const migration of migrations.slice(applied.length)) {
      for (const statement of migration.sql) sqlite.exec(statement);
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
export function createDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  try {
    migrate(sqlite);
  } catch (error) {
    sqlite.close();
    throw error;
  }
  const db = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    statement.setReturnArrays(true);
    if (method === 'run') {
      statement.run(...(params as SQLInputValue[]));
      return { rows: [] };
    }
    if (method === 'get')
      return { rows: (statement.get(...(params as SQLInputValue[])) ?? []) as unknown[] };
    return { rows: statement.all(...(params as SQLInputValue[])) as unknown as unknown[][] };
  });
  sqliteHandles.set(db, sqlite);
  return { db, close: () => sqlite.close() };
}
