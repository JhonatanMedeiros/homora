import { getSqliteHandle } from '@homora/db';
import { createAuth } from './auth.js';

export const TEST_EMAIL = 'admin@homora.test';
export const TEST_PASSWORD = 'password-for-tests';
export const TEST_SESSION_COOKIE = 'homora.session_token=test-session';

/** A session-only auth double for API tests that do not exercise account or login behavior. */
export function createTestSession() {
  const auth = {
    configured: () => true,
    passkey: { rpId: 'localhost', origins: [] as string[] },
    session: async (headers: { cookie?: string }) =>
      headers.cookie?.split(';').some((cookie) => cookie.trim() === TEST_SESSION_COOKIE)
        ? { userId: 'test-user' }
        : null,
    handler: async () => new Response(null, { status: 404 }),
  } as unknown as ReturnType<typeof createAuth>;
  return { auth, cookie: TEST_SESSION_COOKIE };
}

type SqliteRow = Record<string, string | number | null>;
type AuthFixture = { cookie: string; rows: Array<{ table: string; row: SqliteRow }> };

// Generate a real Better Auth account once per worker. Most API tests need an authenticated
// session, not repeated password hashing; copy this isolated fixture into each fresh test DB.
const fixtures = new Map<string, Promise<AuthFixture>>();

function copyFixture(db: object, fixture: AuthFixture) {
  const sqlite = getSqliteHandle(db);
  for (const { table, row } of fixture.rows) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    if (table === 'session') {
      const expiry = columns.indexOf('expiresAt');
      if (expiry !== -1) values[expiry] = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    }
    sqlite
      .prepare(
        `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      .run(...values);
  }
}

/** Creates an auth instance on the given test database with a signed-in administrator. */
export async function createTestAuth(
  db: object,
  { webPort = 5173, allowedOrigins = [] as string[], password = TEST_PASSWORD } = {},
) {
  const sqlite = getSqliteHandle(db);
  const auth = createAuth({
    sqlite,
    secret: 'test-secret-'.repeat(4),
    webPort,
    allowedOrigins,
  });
  const existing = sqlite.prepare('SELECT COUNT(*) AS count FROM "user"').get() as {
    count: number;
  };
  if (existing.count > 0)
    return { auth, cookie: await auth.createSessionCookie(TEST_EMAIL, password) };

  let fixturePromise = fixtures.get(password);
  if (!fixturePromise) {
    fixturePromise = (async () => {
      await auth.setup({ name: 'Administrator', email: TEST_EMAIL, password });
      const cookie = await auth.createSessionCookie(TEST_EMAIL, password);
      const rows = (['user', 'account', 'session'] as const).flatMap((table) =>
        (sqlite.prepare(`SELECT * FROM "${table}"`).all() as SqliteRow[]).map((row) => ({
          table,
          row,
        })),
      );
      return { cookie, rows };
    })();
    fixtures.set(password, fixturePromise);
  }
  const fixture = await fixturePromise;
  const currentCount = (
    sqlite.prepare('SELECT COUNT(*) AS count FROM "user"').get() as {
      count: number;
    }
  ).count;
  if (currentCount === 0) {
    copyFixture(db, fixture);
  }
  return { auth, cookie: fixture.cookie };
}
