import { getSqliteHandle } from '@homora/db';
import { createAuth } from './auth.js';

export const TEST_EMAIL = 'admin@homora.test';
export const TEST_PASSWORD = 'password-for-tests';

/** Creates an auth instance on the given test database with a signed-in administrator. */
export async function createTestAuth(
  db: object,
  { webPort = 5173, allowedOrigins = [] as string[], password = TEST_PASSWORD } = {},
) {
  const auth = createAuth({
    sqlite: getSqliteHandle(db),
    secret: 'test-secret-'.repeat(4),
    webPort,
    allowedOrigins,
  });
  await auth.setup({ name: 'Administrator', email: TEST_EMAIL, password });
  const cookie = await auth.createSessionCookie(TEST_EMAIL, password);
  return { auth, cookie };
}
