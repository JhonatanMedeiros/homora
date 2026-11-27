import type { IncomingHttpHeaders } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { passkey } from '@better-auth/passkey';
import { resolvePasskeyConfig } from './passkey-config.js';
import { oidcProviderId, type OidcConfig } from './oidc-config.js';
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
/** Path (under the base path) the provider redirects back to; the one OIDC route forwarded. */
export const OIDC_CALLBACK_PREFIX = '/callback/';
const withoutProviderTokens = <T extends { providerId?: unknown }>(account: T): T =>
  typeof account.providerId === 'string' && account.providerId.startsWith('oidc-')
    ? { ...account, accessToken: null, refreshToken: null, idToken: null }
    : account;
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

export class EmailUnchangedError extends Error {
  constructor() {
    super('The new e-mail is the same as the current one.');
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
  /** Optional OIDC provider (ADR 0032); everything OIDC is off without it. */
  oidc?: OidcConfig;
};

/**
 * Web authentication for the single administrator account, backed by Better Auth. Accounts
 * and sessions live in the application database (see the `user`, `session` and `account` tables).
 */
export function createAuth({
  sqlite,
  secret,
  webPort,
  allowedOrigins = [],
  passkeyRpId,
  oidc,
}: Options) {
  const passkeyConfig = resolvePasskeyConfig({ webPort, allowedOrigins, rpId: passkeyRpId });
  const countUsers = () =>
    (sqlite.prepare('SELECT COUNT(*) AS count FROM "user"').get() as { count: number }).count;
  const instance = betterAuth({
    appName: 'Homora',
    database: sqlite,
    secret,
    // The provider redirects back to this origin, so it is the configured one when OIDC is on.
    baseURL: oidc?.redirectOrigin ?? `http://localhost:${webPort}`,
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
      // Without a configured provider the plugin has nothing to register and adds no route use.
      genericOAuth({
        config: oidc
          ? [
              {
                providerId: oidcProviderId(oidc.issuer),
                discoveryUrl: `${oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
                clientId: oidc.clientId,
                clientSecret: oidc.clientSecret,
                // The e-mail claim is only asked for because the library requires one; it never
                // decides who may sign in (implicit linking is off, below).
                scopes: ['openid', 'email', 'profile'],
                pkce: true,
                requireIdTokenVerification: true,
                // No userinfo requests: without them a token response lacking an ID token cannot
                // sign in on unverified userinfo claims. The ID token must carry `sub` and `email`.
                userInfoUrl: '',
                // Only a linked identity opens the account; the provider can never create one.
                disableSignUp: true,
                disableImplicitSignUp: true,
                overrideUserInfo: false,
              },
            ]
          : [],
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
    account: {
      // Explicit linking by the signed-in administrator only (`link-social`): a matching e-mail
      // address, verified or not, never links or signs in anything.
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        // The administrator chose this provider: without it the library refuses an explicit link
        // whose e-mail the provider did not verify. It does not permit implicit linking.
        trustedProviders: oidc ? [oidcProviderId(oidc.issuer)] : [],
      },
      encryptOAuthTokens: true,
    },
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
      // The provider's redirect back is a cross-site navigation: only the short-lived, signed
      // `state` cookie of the attempt must travel with it. Every other cookie stays Strict.
      cookies: { state: { attributes: { sameSite: 'lax' } } },
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
              // An OIDC sign-in is a browser session of eight hours ("keep me signed in" does not
              // apply: the provider's own session decides how long it stays valid there).
              if (context?.path?.startsWith(OIDC_CALLBACK_PREFIX))
                return new Date(Date.now() + SESSION_SECONDS * 1000);
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
      account: {
        // Homora never needs the provider's tokens: they are dropped before they are stored.
        create: {
          before: async (account) => {
            // One identity at a time: two link attempts started together must not both land.
            // (The gateway runs callbacks one after another, so this check cannot be raced.)
            if (account.providerId.startsWith('oidc-') && oidcLinks().length > 0) return false;
            return { data: withoutProviderTokens(account) };
          },
        },
        update: { before: async (account) => ({ data: withoutProviderTokens(account) }) },
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

  /** The linked OIDC identities; they outlive the configuration that created them. */
  function oidcLinks() {
    return sqlite
      .prepare(
        "SELECT id, providerId, userId, createdAt FROM account WHERE providerId LIKE 'oidc-%'",
      )
      .all() as { id: string; providerId: string; userId: string; createdAt: string }[];
  }

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
    /**
     * Changes the sign-in e-mail after the password is confirmed. It shares the password-guess limit
     * and ends no session: whoever holds one already needed the password to get here.
     */
    async changeEmail(
      headers: IncomingHttpHeaders,
      input: { email: string; currentPassword: string },
    ) {
      const nodeHeaders = fromNodeHeaders(headers);
      const found = await instance.api.getSession({ headers: nodeHeaders });
      if (!found) throw new SessionNotFoundError();
      await consumePasswordAttempt(found.user.id);
      try {
        await instance.api.verifyPassword({
          headers: nodeHeaders,
          body: { password: input.currentPassword },
        });
      } catch (error) {
        if (error instanceof APIError && error.body?.code === 'INVALID_PASSWORD')
          throw new InvalidPasswordError();
        throw error;
      }
      if (input.email === found.user.email.toLowerCase()) throw new EmailUnchangedError();
      const context = await instance.$context;
      await context.internalAdapter.updateUser(found.user.id, { email: input.email });
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
      setupQueue = run.catch(() => {});
      return run;
    },
    /**
     * Optional OIDC provider, run entirely by Better Auth's generic OAuth plugin. Starting
     * returns the provider URL and the cookies of the attempt; the callback is the one OIDC route
     * the gateway forwards. The link lives in the library's `account` table.
     */
    oidc: oidc && {
      providerId: oidcProviderId(oidc.issuer),
      async start(headers: IncomingHttpHeaders, mode: 'login' | 'link') {
        const input = { headers: fromNodeHeaders(headers), returnHeaders: true as const };
        const provider = oidcProviderId(oidc.issuer);
        const result =
          mode === 'login'
            ? await instance.api.signInSocial({
                ...input,
                body: {
                  provider,
                  callbackURL: '/',
                  errorCallbackURL: '/login',
                  disableRedirect: true,
                },
              })
            : await instance.api.linkSocialAccount({
                ...input,
                body: {
                  provider,
                  callbackURL: '/account?oidc=linked',
                  errorCallbackURL: '/account',
                  disableRedirect: true,
                },
              });
        // ID tokens are verified against the issuer discovery reports: it must be the configured
        // one, or the configuration points somewhere other than the operator wrote.
        const { socialProviders } = await instance.$context;
        const discovered = socialProviders.find(({ id }) => id === provider)?.issuer;
        if (discovered !== oidc.issuer)
          throw new Error(
            `The discovery document reports the issuer "${discovered}", not HOMORA_OIDC_ISSUER.`,
          );
        return { url: result.response.url, cookies: result.headers.getSetCookie() };
      },
      /**
       * The ID token algorithms the provider advertises, when none of them can be verified: Homora
       * checks signatures against the provider's published keys, so HMAC (`HS*`, signed with the
       * client secret) never passes. Null when sign-in can work or discovery has not succeeded.
       * Read from what the plugin already discovered; no request of its own.
       */
      async unverifiableAlgorithms(): Promise<string[] | null> {
        const { socialProviders } = await instance.$context;
        const provider = socialProviders.find(({ id }) => id === oidcProviderId(oidc.issuer));
        const idToken = provider?.idToken;
        const algorithms = (idToken && 'algorithms' in idToken && idToken.algorithms) || [];
        return algorithms.length > 0 && algorithms.every((name) => name.startsWith('HS'))
          ? [...algorithms]
          : null;
      },
    },
    /**
     * The identity links, available even after OIDC was switched off, so that a link can always be
     * removed (otherwise restoring the configuration would reactivate it).
     */
    oidcLinks: {
      list: oidcLinks,
      /** Removes every linked identity and forgets unfinished attempts, which could relink. */
      async removeAll(headers: IncomingHttpHeaders) {
        for (const { id } of oidcLinks())
          await instance.api.unlinkAccount({
            headers: fromNodeHeaders(headers),
            body: { accountId: id },
          });
        sqlite.exec("DELETE FROM verification WHERE value LIKE '%codeVerifier%'");
      },
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
