import type { IncomingHttpHeaders } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import {
  createRateLimitStorage,
  SIGN_IN_MAX_ATTEMPTS,
  SIGN_IN_WINDOW_SECONDS,
} from './auth-rate-limit.js';
export { createRateLimitStorage } from './auth-rate-limit.js';
export { loadSessionSecret } from './auth-session-secret.js';

/** Path under which the Better Auth handler is mounted. */
export const AUTH_BASE_PATH = '/api/auth';
/** Header the API overwrites with the client address Fastify resolved (never client-controlled). */
export const CLIENT_IP_HEADER = 'x-homora-client-ip';

const SESSION_SECONDS = 8 * 60 * 60;
export class AccountExistsError extends Error {
  constructor() {
    super('An administrator account already exists.');
  }
}

export class RateLimitedError extends Error {
  constructor() {
    super('Too many attempts.');
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super('The current password is wrong.');
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found.');
  }
}

export type AccountInput = { name: string; email: string; password: string };

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

  // Guesses of the current password by someone holding a session are throttled per account.
  const passwordLimiter = createRateLimitStorage();
  const toIso = (value: Date | string) => new Date(value).toISOString();

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
    /** Name and e-mail of the signed-in account. */
    async profile(headers: IncomingHttpHeaders) {
      const found = await instance.api.getSession({ headers: fromNodeHeaders(headers) });
      return found ? { name: found.user.name, email: found.user.email } : null;
    },
    async updateName(headers: IncomingHttpHeaders, name: string) {
      await instance.api.updateUser({ headers: fromNodeHeaders(headers), body: { name } });
    },
    /** Active sessions without their tokens, which never leave the backend. */
    async listSessions(headers: IncomingHttpHeaders) {
      const nodeHeaders = fromNodeHeaders(headers);
      const current = await instance.api.getSession({ headers: nodeHeaders });
      const sessions = await instance.api.listSessions({ headers: nodeHeaders });
      return sessions
        .map((row) => ({
          id: row.id,
          userAgent: row.userAgent ?? null,
          ipAddress: row.ipAddress ?? null,
          createdAt: toIso(row.createdAt),
          expiresAt: toIso(row.expiresAt),
          current: row.id === current?.session.id,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    /** Ends another session of the signed-in account; the current one signs out instead. */
    async revokeSession(headers: IncomingHttpHeaders, id: string) {
      const nodeHeaders = fromNodeHeaders(headers);
      const current = await instance.api.getSession({ headers: nodeHeaders });
      const sessions = await instance.api.listSessions({ headers: nodeHeaders });
      const target = sessions.find((row) => row.id === id);
      if (!target || target.id === current?.session.id) throw new SessionNotFoundError();
      await instance.api.revokeSession({ headers: nodeHeaders, body: { token: target.token } });
    },
    /** Ends every session of the account except the current one. */
    async revokeOtherSessions(headers: IncomingHttpHeaders) {
      await instance.api.revokeOtherSessions({ headers: fromNodeHeaders(headers) });
    },
    async changePassword(
      headers: IncomingHttpHeaders,
      input: { currentPassword: string; newPassword: string; revokeOthers: boolean },
    ) {
      const nodeHeaders = fromNodeHeaders(headers);
      const found = await instance.api.getSession({ headers: nodeHeaders });
      if (!found) throw new SessionNotFoundError();
      const limit = await passwordLimiter.consume(`change-password:${found.user.id}`, {
        window: SIGN_IN_WINDOW_SECONDS,
        max: SIGN_IN_MAX_ATTEMPTS,
      });
      if (!limit.allowed) throw new RateLimitedError();
      try {
        // Not `revokeOtherSessions`: that option also ends the current session.
        await instance.api.changePassword({
          headers: nodeHeaders,
          body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
        });
      } catch (error) {
        if (error instanceof APIError && error.body?.code === 'INVALID_PASSWORD')
          throw new InvalidPasswordError();
        throw error;
      }
      if (input.revokeOthers) await instance.api.revokeOtherSessions({ headers: nodeHeaders });
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
