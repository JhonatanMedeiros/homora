import { AUTH_BASE_PATH } from './auth.js';
import { errorBody, type ErrorCode } from './api-error.js';

/** The only second-factor routes of Better Auth that the API forwards. */
export const TWO_FACTOR_ROUTES = {
  /** Confirms the authenticator app while setting up, or finishes a sign-in challenge. */
  verifyCode: `${AUTH_BASE_PATH}/two-factor/verify-totp`,
  /** Finishes a sign-in challenge with a one-time recovery code. */
  verifyRecoveryCode: `${AUTH_BASE_PATH}/two-factor/verify-backup-code`,
  /** Starts the setup: returns the secret URI and the first set of recovery codes. */
  enable: `${AUTH_BASE_PATH}/two-factor/enable`,
  disable: `${AUTH_BASE_PATH}/two-factor/disable`,
  regenerateRecoveryCodes: `${AUTH_BASE_PATH}/two-factor/generate-backup-codes`,
} as const;

export const TWO_FACTOR_PATHS: ReadonlySet<string> = new Set(Object.values(TWO_FACTOR_ROUTES));

const CODE_ROUTES: ReadonlySet<string> = new Set([
  TWO_FACTOR_ROUTES.verifyCode,
  TWO_FACTOR_ROUTES.verifyRecoveryCode,
]);

/**
 * Keeps only the fields the interface may send. Dropping `trustDevice` means no browser is ever
 * remembered as a second factor; `disableSession`, `method` and `issuer` are never offered.
 */
export function sanitizeTwoFactorBody(pathname: string, body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { code, password } = body as { code?: unknown; password?: unknown };
  return CODE_ROUTES.has(pathname) ? { code } : { password };
}

const ERRORS: Record<string, ErrorCode> = {
  INVALID_CODE: 'two-factor-invalid-code',
  INVALID_BACKUP_CODE: 'two-factor-invalid-code',
  INVALID_TWO_FACTOR_COOKIE: 'two-factor-challenge-expired',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'two-factor-challenge-expired',
  ACCOUNT_TEMPORARILY_LOCKED: 'two-factor-locked',
  TOTP_ALREADY_ENABLED: 'two-factor-already-enabled',
  TOTP_NOT_ENABLED: 'two-factor-not-enabled',
  TWO_FACTOR_NOT_ENABLED: 'two-factor-not-enabled',
  BACKUP_CODES_NOT_ENABLED: 'two-factor-not-enabled',
  INVALID_PASSWORD: 'invalid-current-password',
  SESSION_NOT_FRESH: 'session-not-fresh',
};

/** Homora error body for a failed second-factor response, or null to keep the original. */
export function twoFactorErrorBody(text: string | null) {
  try {
    const code = (JSON.parse(text ?? '{}') as { code?: unknown }).code;
    const mapped = typeof code === 'string' ? ERRORS[code] : undefined;
    return mapped ? errorBody(mapped) : null;
  } catch {
    return null;
  }
}

/** `name=value` pair of the session cookie in a response, usable as a `Cookie` header. */
export function sessionCookieOf(setCookies: string[]) {
  return (
    setCookies
      .map((cookie) => cookie.split(';')[0])
      .find((pair) => pair.startsWith('homora.session_token=') && !pair.endsWith('=')) ?? null
  );
}
