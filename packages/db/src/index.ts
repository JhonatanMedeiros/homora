import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { embeddedMigrations } from './migrations.generated.js';
export {
  monitors,
  services,
  serviceGroups,
  pages,
  integrationInstances,
  integrationWidgets,
  agentIdentities,
  serviceProposals,
  configVersion,
  auditEvents,
  weatherProviders,
} from './schema.js';
const sqliteHandles = new WeakMap<object, DatabaseSync>();
export function getSqliteHandle(db: object) {
  const handle = sqliteHandles.get(db);
  if (!handle) throw new Error('Database handle unavailable');
  return handle;
}

/** What the migrator did, for the startup log and `/api/health`. */
export type MigrationReport = {
  /** Migrations this build ships. */
  known: number;
  /** Migrations recorded in the database before this run. */
  alreadyApplied: number;
  /** Migrations applied by this run. */
  appliedNow: number;
  /** Creation time (ISO) of the newest migration recorded after this run. */
  latest: string | null;
};

/** Raised when the database history does not match the migrations of this build. */
export class MigrationHistoryError extends Error {
  // No parameter properties: scripts load this file through Node's type stripping.
  details: {
    reason: 'schema-ahead' | 'diverged';
    known: number;
    recorded: number;
    /** First position where the recorded history differs, when it diverged. */
    divergedAt: number | null;
  };
  constructor(details: MigrationHistoryError['details']) {
    super('Incompatible migration history.');
    this.name = 'MigrationHistoryError';
    this.details = details;
  }
}

const foreignKeyViolations = (sqlite: DatabaseSync) =>
  sqlite.prepare('PRAGMA foreign_key_check').all().length;

/** Same shape and hash as Drizzle's readMigrationFiles, read from the embedded copy. */
export function loadMigrations() {
  return embeddedMigrations.map((migration) => ({
    sql: migration.sql.split('--> statement-breakpoint'),
    bps: migration.breakpoints,
    folderMillis: migration.when,
    hash: createHash('sha256').update(migration.sql).digest('hex'),
  }));
}

/**
 * Apply generated Drizzle migrations atomically, adopting only the known legacy schema.
 *
 * Foreign keys are off while the migrations run, so a migration can rebuild a table that others
 * reference without cascading deletes into them (SQLite ignores that pragma inside a transaction,
 * hence it is set around it). Rows that reference a missing parent after the migrations, beyond
 * those the database already had, roll everything back.
 */
function migrate(sqlite: DatabaseSync): MigrationReport {
  const migrations = loadMigrations();
  sqlite.exec('PRAGMA foreign_keys = OFF');
  try {
    return migrateWithoutForeignKeys(sqlite, migrations);
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON');
  }
}

function migrateWithoutForeignKeys(
  sqlite: DatabaseSync,
  migrations: ReturnType<typeof loadMigrations>,
): MigrationReport {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const violationsBefore = foreignKeyViolations(sqlite);
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    const applied = sqlite
      .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
      .all() as { hash: string; created_at: number }[];
    const divergedAt = applied.findIndex(
      (row, i) =>
        row.hash !== migrations[i]?.hash || Number(row.created_at) !== migrations[i]?.folderMillis,
    );
    if (applied.length > migrations.length || divergedAt !== -1)
      throw new MigrationHistoryError({
        // More recorded migrations than this build knows, and the shared prefix matches: a newer
        // build wrote to this database.
        reason: divergedAt === -1 || divergedAt >= migrations.length ? 'schema-ahead' : 'diverged',
        known: migrations.length,
        recorded: applied.length,
        divergedAt: divergedAt === -1 ? null : divergedAt,
      });
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
    const alreadyApplied = applied.length;
    for (const migration of migrations.slice(applied.length)) {
      for (const statement of migration.sql) sqlite.exec(statement);
      sqlite
        .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
        .run(migration.hash, migration.folderMillis);
    }
    if (foreignKeyViolations(sqlite) > violationsBefore)
      throw new Error('Migration left rows that reference missing parents.');
    sqlite.exec('COMMIT');
    const newest = migrations.at(-1);
    return {
      known: migrations.length,
      alreadyApplied,
      appliedNow: migrations.length - alreadyApplied,
      latest: newest ? new Date(newest.folderMillis).toISOString() : null,
    };
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
export function createDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  let migrations: MigrationReport;
  try {
    sqlite.exec('PRAGMA busy_timeout = 2000;');
    if (path !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL;');
    migrations = migrate(sqlite);
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
  return { db, close: () => sqlite.close(), migrations };
}
