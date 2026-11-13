import type { IncomingHttpHeaders } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { resolvePasskeyConfig } from './passkey-config.js';
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
const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;
/** Better Auth routes that only exist for two-factor authentication, relative to the base path. */
const TWO_FACTOR_PATH_PREFIX = '/two-factor/';
/** Header the API sets from the sign-in form's choice; the hook below reads it, clients cannot. */
export const REMEMBER_ME_HEADER = 'x-homora-remember-me';
/** Better Auth routes that only exist for passkeys, relative to the base path. */
const PASSKEY_PATH_PREFIX = '/passkey/';
/** Seconds the password step stays valid while the authenticator code is typed. */
const TWO_FACTOR_CHALLENGE_SECONDS = 5 * 60;
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
  /** Domain the passkeys are bound to (`HOMORA_PASSKEY_RP_ID`); defaults to `localhost`. */
  passkeyRpId?: string;
};

/**
 * Web authentication for the single administrator account, backed by Better Auth. Accounts
 * and sessions live in the application database (see the `user`, `session` and `account` tables).
 */
export function createAuth({ sqlite, secret, webPort, allowedOrigins = [], passkeyRpId }: Options) {
  const passkeyConfig = resolvePasskeyConfig({ webPort, allowedOrigins, rpId: passkeyRpId });
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
    plugins: [
      passkey({
        rpID: passkeyConfig.rpId,
        rpName: 'Homora',
        // Explicit server-side origins: the request (Host, Origin, X-Forwarded-*) never picks them.
        origin: passkeyConfig.origins,
        // Discoverable credentials with biometrics or PIN: the passkey alone is possession plus
        // user verification, so the sign-in is complete without a password.
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }),
      twoFactor({
        issuer: 'Homora',
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        // Authenticator app only: no e-mail/SMS codes (`otpOptions` is left unset) and no
        // trusted-device cookie (the routes drop `trustDevice`).
        backupCodeOptions: { storeBackupCodes: 'encrypted', amount: 10, length: 10 },
        // Ten wrong codes in a row lock the second step for 15 minutes.
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
      }),
    ],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 1024,
      autoSignIn: false,
    },
    session: { expiresIn: REMEMBERED_SESSION_SECONDS, disableSessionRefresh: true },
    // Public sign-up is closed: the account is created by `setup()` only.
    disabledPaths: ['/sign-up/email'],
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      customStorage: createRateLimitStorage(),
      customRules: {
        '/sign-in/email': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
        // Guessing a code or the password through the second-factor routes is limited like sign-in.
        '/two-factor/verify-totp': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
        '/two-factor/verify-backup-code': {
          window: SIGN_IN_WINDOW_SECONDS,
          max: SIGN_IN_MAX_ATTEMPTS,
        },
        '/two-factor/enable': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
        '/two-factor/disable': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
        '/two-factor/generate-backup-codes': {
          window: SIGN_IN_WINDOW_SECONDS,
          max: SIGN_IN_MAX_ATTEMPTS,
        },
        // Signing in with a passkey is limited like the password; the challenge request that
        // precedes it only needs a looser limit because it writes a short-lived row.
        '/passkey/verify-authentication': {
          window: SIGN_IN_WINDOW_SECONDS,
          max: SIGN_IN_MAX_ATTEMPTS,
        },
        '/passkey/generate-authenticate-options': { window: 60, max: 30 },
        '/passkey/generate-register-options': {
          window: SIGN_IN_WINDOW_SECONDS,
          max: SIGN_IN_MAX_ATTEMPTS,
        },
        '/passkey/verify-registration': {
          window: SIGN_IN_WINDOW_SECONDS,
          max: SIGN_IN_MAX_ATTEMPTS,
        },
        '/passkey/delete-passkey': { window: SIGN_IN_WINDOW_SECONDS, max: SIGN_IN_MAX_ATTEMPTS },
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
      session: {
        create: {
          // Better Auth otherwise hard-codes a 24-hour lifetime for browser-session cookies.
          before: async (session, context) => {
            const expiresAt = async () => {
              if (context?.path === '/sign-in/email')
                return context.body?.rememberMe === false
                  ? new Date(Date.now() + SESSION_SECONDS * 1000)
                  : null;
              // A passkey sign-in has no "forget me" cookie: the form's choice arrives in a header.
              if (context?.path === `${PASSKEY_PATH_PREFIX}verify-authentication`)
                return context.request?.headers.get(REMEMBER_ME_HEADER) === '1'
                  ? null
                  : new Date(Date.now() + SESSION_SECONDS * 1000);
              if (!context?.path?.startsWith(TWO_FACTOR_PATH_PREFIX)) return null;
              // Enabling or disabling the second step replaces the current session: keep its end.
              const active = context.context.session?.session;
              if (active) return new Date(active.expiresAt);
              // Finishing a sign-in: the choice made at the password step is in this cookie.
              const forgotten = await context.getSignedCookie(
                context.context.authCookies.dontRememberToken.name,
                context.context.secret,
              );
              return forgotten ? new Date(Date.now() + SESSION_SECONDS * 1000) : null;
            };
            const end = await expiresAt();
            if (end) return { data: { ...session, expiresAt: end } };
          },
        },
      },
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

  const consumePasswordAttempt = async (userId: string) => {
    const limit = await passwordLimiter.consume(`change-password:${userId}`, {
      window: SIGN_IN_WINDOW_SECONDS,
      max: SIGN_IN_MAX_ATTEMPTS,
    });
    if (!limit.allowed) throw new RateLimitedError();
  };

  // First-run setups are serialized so two simultaneous requests cannot both pass the check.
  let setupQueue: Promise<unknown> = Promise.resolve();

  return {
    /** Relying party and origins the passkeys are bound to. */
    passkey: passkeyConfig,
    /** Resolved Better Auth options, used to verify the database schema. */
    options: instance.options,
    configured: () => countUsers() > 0,
    /** Handles `/api/auth/*` requests for Better Auth. */
    handler: (request: Request) => instance.handler(request),
    async session(headers: IncomingHttpHeaders) {
      const found = await instance.api.getSession({ headers: fromNodeHeaders(headers) });
      return found
        ? { userId: found.user.id, twoFactorEnabled: found.user.twoFactorEnabled === true }
        : null;
    },
    /** Name, e-mail and second-factor status of the signed-in account. */
    async profile(headers: IncomingHttpHeaders) {
      const found = await instance.api.getSession({ headers: fromNodeHeaders(headers) });
      return found
        ? {
            name: found.user.name,
            email: found.user.email,
            twoFactorEnabled: found.user.twoFactorEnabled === true,
          }
        : null;
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
    /** Re-authentication for sensitive actions; shares the per-account password-guess limit. */
    async confirmPassword(headers: IncomingHttpHeaders, password: string) {
      const nodeHeaders = fromNodeHeaders(headers);
      const found = await instance.api.getSession({ headers: nodeHeaders });
      if (!found) throw new SessionNotFoundError();
      await consumePasswordAttempt(found.user.id);
      try {
        await instance.api.verifyPassword({ headers: nodeHeaders, body: { password } });
      } catch (error) {
        if (error instanceof APIError && error.body?.code === 'INVALID_PASSWORD')
          throw new InvalidPasswordError();
        throw error;
      }
    },
    async changePassword(
      headers: IncomingHttpHeaders,
      input: { currentPassword: string; newPassword: string; revokeOthers: boolean },
    ) {
      const nodeHeaders = fromNodeHeaders(headers);
      const found = await instance.api.getSession({ headers: nodeHeaders });
      if (!found) throw new SessionNotFoundError();
      await consumePasswordAttempt(found.user.id);
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
        body: { email, password, rememberMe: false },
        returnHeaders: true,
      });
      return headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    },
  };
}
