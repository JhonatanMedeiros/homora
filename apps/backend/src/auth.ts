import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';

/** Path under which the Better Auth handler is mounted. */
export const AUTH_BASE_PATH = '/api/auth';
/** Header the API overwrites with the client address Fastify resolved (never client-controlled). */
export const CLIENT_IP_HEADER = 'x-homora-client-ip';

const SESSION_SECONDS = 8 * 60 * 60;
const SIGN_IN_WINDOW_SECONDS = 15 * 60;
// Better Auth counts every attempt to the path, not only the failed ones.
const SIGN_IN_MAX_ATTEMPTS = 10;

const MAX_RATE_LIMIT_ENTRIES = 10_000;

/**
 * Rate-limit counters kept in this instance's memory. Better Auth's built-in memory store is
 * shared by every instance in the process, so a private one keeps instances independent. The
 * window starts at the first request and counters reset when the backend restarts.
 */
export function createRateLimitStorage(now: () => number = Date.now) {
  const entries = new Map<string, { count: number; start: number; end: number }>();
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const time = now();
      for (const [name, entry] of entries) if (time >= entry.end) entries.delete(name);
      const current = entries.get(key);
      if (!current) {
        // Oldest entries go first when a flood of distinct clients fills the table.
        for (const name of entries.keys()) {
          if (entries.size < MAX_RATE_LIMIT_ENTRIES) break;
          entries.delete(name);
        }
        entries.set(key, { count: 1, start: time, end: time + rule.window * 1000 });
        return { allowed: true, retryAfter: null };
      }
      if (current.count >= rule.max)
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.end - time) / 1000)) };
      current.count++;
      return { allowed: true, retryAfter: null };
    },
  };
}

export class AccountExistsError extends Error {
  constructor() {
    super('An administrator account already exists.');
  }
}

export type AccountInput = { name: string; email: string; password: string };

/**
 * Secret used to sign session cookies. `HOMORA_SESSION_SECRET` wins; otherwise a random secret
 * is created next to the database (mode 0600). Losing it only signs everyone out.
 */
export function loadSessionSecret(path: string, configured?: string): string {
  if (configured) return configured;
  const read = () => {
    const value = readFileSync(path, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid session secret file.');
    return value;
  };
  try {
    return read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return read();
}

type Options = {
  sqlite: DatabaseSync;
  secret: string;
  webPort: number;
  allowedOrigins?: readonly string[];
};

/**
 * Web authentication for the single administrator account, backed by Better Auth. Accounts
 * and sessions live in the application database (see the `user`, `session` and `account` tables).
 */
export function createAuth({ sqlite, secret, webPort, allowedOrigins = [] }: Options) {
  const countUsers = () =>
    (sqlite.prepare('SELECT COUNT(*) AS count FROM "user"').get() as { count: number }).count;
  const instance = betterAuth({
    appName: 'Homora',
    database: sqlite,
    secret,
    baseURL: `http://localhost:${webPort}`,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [
      `http://127.0.0.1:${webPort}`,
      `http://localhost:${webPort}`,
      ...allowedOrigins,
    ],
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 1024,
      autoSignIn: false,
    },
    session: { expiresIn: SESSION_SECONDS },
    // Public sign-up is closed: the account is created by `setup()` only.
    disabledPaths: ['/sign-up/email'],
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      customStorage: createRateLimitStorage(),
      customRules: {
        '/sign-in/email': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
      },
    },
    advanced: {
      cookiePrefix: 'homora',
      // `Secure` is added by the API from the request origin (see routes/auth.ts).
      useSecureCookies: false,
      defaultCookieAttributes: { sameSite: 'strict' },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    databaseHooks: {
      user: {
        create: {
          // Last line of defense: no route can ever create a second account.
          before: async () => {
            if (countUsers() > 0) throw new APIError('FORBIDDEN', { message: 'account-exists' });
          },
        },
      },
    },
  });

  // First-run setups are serialized so two simultaneous requests cannot both pass the check.
  let setupQueue: Promise<unknown> = Promise.resolve();

  return {
    /** Resolved Better Auth options, used to verify the database schema. */
    options: instance.options,
    configured: () => countUsers() > 0,
    /** Handles `/api/auth/*` requests for Better Auth. */
    handler: (request: Request) => instance.handler(request),
    async session(headers: IncomingHttpHeaders) {
      const found = await instance.api.getSession({ headers: fromNodeHeaders(headers) });
      return found ? { userId: found.user.id } : null;
    },
    /** Creates the first administrator account; fails once any account exists. */
    setup(input: AccountInput): Promise<void> {
      const run = setupQueue.then(async () => {
        if (countUsers() > 0) throw new AccountExistsError();
        await instance.api.signUpEmail({ body: input });
      });
      setupQueue = run.catch(() => undefined);
      return run;
    },
    /** Server-side sign-in returning a `Cookie` header value (tests and restore checks). */
    async createSessionCookie(email: string, password: string) {
      const { headers } = await instance.api.signInEmail({
        body: { email, password },
        returnHeaders: true,
      });
      return headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    },
  };
}
