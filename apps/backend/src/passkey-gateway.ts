import { z } from 'zod';
import { AUTH_BASE_PATH } from './auth.js';
import { errorBody, type ErrorCode } from './api-error.js';

/**
 * The only passkey routes of Better Auth that the API forwards, with the method each accepts.
 * Better Auth's registration route is a GET that would put the password in the URL, so the
 * interface POSTs it and the API turns it into the plugin's request after checking the password.
 */
export const PASSKEY_ROUTES = {
  /** Public: the challenge for signing in with a passkey. */
  authenticationOptions: {
    path: `${AUTH_BASE_PATH}/passkey/generate-authenticate-options`,
    method: 'GET',
  },
  /** Public: verifies the assertion and opens a session. */
  signIn: { path: `${AUTH_BASE_PATH}/passkey/verify-authentication`, method: 'POST' },
  /** Signed in and re-authenticated with the password. */
  registrationOptions: {
    path: `${AUTH_BASE_PATH}/passkey/generate-register-options`,
    method: 'POST',
  },
  register: { path: `${AUTH_BASE_PATH}/passkey/verify-registration`, method: 'POST' },
  list: { path: `${AUTH_BASE_PATH}/passkey/list-user-passkeys`, method: 'GET' },
  rename: { path: `${AUTH_BASE_PATH}/passkey/update-passkey`, method: 'POST' },
  /** Signed in and re-authenticated with the password. */
  remove: { path: `${AUTH_BASE_PATH}/passkey/delete-passkey`, method: 'POST' },
} as const;

export const PASSKEY_PATHS: ReadonlySet<string> = new Set(
  Object.values(PASSKEY_ROUTES).map((route) => route.path),
);

/** Routes that work without a session; every other one needs a signed-in administrator. */
export const PUBLIC_PASSKEY_PATHS: ReadonlySet<string> = new Set([
  PASSKEY_ROUTES.authenticationOptions.path,
  PASSKEY_ROUTES.signIn.path,
]);

export const PASSKEY_NAME_MAX = 60;

const name = z.string().trim().min(1).max(PASSKEY_NAME_MAX);
const id = z.string().min(1).max(128);
const password = z.string().min(1).max(1024);
const assertion = z.record(z.string(), z.unknown());

const schemas = {
  [PASSKEY_ROUTES.signIn.path]: z.object({
    response: assertion,
    rememberMe: z.boolean().optional(),
  }),
  [PASSKEY_ROUTES.registrationOptions.path]: z.object({ password }),
  // `createSession` is never offered: adding a passkey does not open another session.
  [PASSKEY_ROUTES.register.path]: z.object({ response: assertion, name: name.optional() }),
  [PASSKEY_ROUTES.rename.path]: z.object({ id, name }),
  [PASSKEY_ROUTES.remove.path]: z.object({ id, password }),
} as const;

export type PasskeyBodyResult =
  { ok: true; body: Record<string, unknown> | undefined } | { ok: false; code: ErrorCode };

/** Validates a body and keeps only the fields the interface may send. */
export function parsePasskeyBody(pathname: string, body: unknown): PasskeyBodyResult {
  const schema = schemas[pathname as keyof typeof schemas];
  if (!schema) return { ok: true, body: undefined };
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, body: parsed.data };
  const badName = parsed.error.issues.some((issue) => issue.path[0] === 'name');
  return { ok: false, code: badName ? 'invalid-passkey-name' : 'invalid-data' };
}

type StoredPasskey = {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  deviceType?: string | null;
  backedUp?: boolean | null;
  transports?: string | null;
};

/**
 * What the interface may see of a passkey. The public key, credential ID and signature counter
 * stay in the database.
 */
export const publicPasskey = (row: StoredPasskey) => ({
  id: row.id,
  name: row.name ?? null,
  createdAt: row.createdAt ?? null,
  deviceType: row.deviceType ?? null,
  backedUp: row.backedUp === true,
  transports: row.transports ? row.transports.split(',').filter(Boolean) : [],
});

const ERRORS: Record<string, ErrorCode> = {
  CHALLENGE_NOT_FOUND: 'passkey-challenge-expired',
  // Unknown credential, bad signature, wrong origin or RP ID, missing user verification, replay:
  // all answer the same, so the response never says which check failed.
  AUTHENTICATION_FAILED: 'passkey-sign-in-failed',
  PASSKEY_NOT_FOUND: 'passkey-sign-in-failed',
  FAILED_TO_VERIFY_REGISTRATION: 'passkey-registration-failed',
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: 'passkey-registration-failed',
  SESSION_REQUIRED: 'auth-required',
  SESSION_NOT_FRESH: 'session-not-fresh',
};

/** Homora error body for a failed passkey response, whatever the plugin said. */
export function passkeyErrorBody(pathname: string, status: number, text: string | null) {
  let code: string | undefined;
  try {
    const parsed = (JSON.parse(text ?? '{}') as { code?: unknown }).code;
    code = typeof parsed === 'string' ? parsed : undefined;
  } catch {
    /* Not JSON: handled below. */
  }
  const mapped = code ? ERRORS[code] : undefined;
  if (mapped) return errorBody(mapped);
  if (status === 401) return errorBody('auth-required');
  if (status === 404 && pathname === PASSKEY_ROUTES.remove.path)
    return errorBody('passkey-not-found');
  if (pathname === PASSKEY_ROUTES.signIn.path) return errorBody('passkey-sign-in-failed');
  if (pathname === PASSKEY_ROUTES.authenticationOptions.path) return errorBody('internal-error');
  return errorBody('passkey-registration-failed');
}

/** A session cookie without `Max-Age`/`Expires` ends with the browser session. */
export const asBrowserSessionCookie = (cookie: string) =>
  cookie.startsWith('homora.session_token=')
    ? cookie
        .split(';')
        .filter((part, index) => index === 0 || !/^\s*(max-age|expires)=/i.test(part))
        .join(';')
    : cookie;
