import { createHash } from 'node:crypto';

export type OidcConfig = {
  /** Issuer URL; the provider's discovery document is read from it. HTTPS only. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Label of the sign-in button; plain text. */
  name: string;
  /** Origin the browser uses to reach Homora and that the provider redirects back to. */
  redirectOrigin: string;
};

/**
 * The provider id Better Auth stores with the linked identity. It is derived from the issuer, so
 * an identity linked at one provider never matches another, even with the same subject.
 */
export const oidcProviderId = (issuer: string) =>
  `oidc-${createHash('sha256').update(issuer).digest('hex').slice(0, 16)}`;

const DEFAULT_NAME = 'OpenID Connect';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function httpsUrl(value: string, variable: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error(`${variable} must be an HTTPS URL without credentials, query or fragment.`);
  return url;
}

/**
 * Reads the optional OIDC provider (ADR 0032). Everything is off unless `HOMORA_OIDC_ISSUER` is
 * set; a partial configuration fails at startup instead of leaving a half-working sign-in. The
 * redirect origin is never taken from a request: it is the one configured origin the browser
 * uses, which also decides whether the temporary cookies are `Secure`.
 */
export function parseOidcConfig(
  env: NodeJS.ProcessEnv,
  { webPort, allowedOrigins }: { webPort: number; allowedOrigins: readonly string[] },
): OidcConfig | undefined {
  const value = (name: string) => env[name]?.trim() || undefined;
  const names = [
    'HOMORA_OIDC_ISSUER',
    'HOMORA_OIDC_CLIENT_ID',
    'HOMORA_OIDC_CLIENT_SECRET',
    'HOMORA_OIDC_NAME',
    'HOMORA_OIDC_REDIRECT_ORIGIN',
  ];
  const issuerValue = value('HOMORA_OIDC_ISSUER');
  if (!issuerValue) {
    if (names.some((name) => value(name)))
      throw new Error('HOMORA_OIDC_ISSUER is required when any other HOMORA_OIDC_* is set.');
    return undefined;
  }
  // Kept exactly as written: the provider's `issuer` must match it character for character
  // (some use a trailing slash, some do not).
  httpsUrl(issuerValue, 'HOMORA_OIDC_ISSUER');
  const issuer = issuerValue;
  const clientId = value('HOMORA_OIDC_CLIENT_ID');
  const clientSecret = env.HOMORA_OIDC_CLIENT_SECRET;
  if (!clientId || clientId.length > 256 || /[\r\n]/.test(clientId))
    throw new Error('HOMORA_OIDC_CLIENT_ID is required.');
  if (!clientSecret || clientSecret.length > 1024 || /[\r\n]/.test(clientSecret))
    throw new Error('HOMORA_OIDC_CLIENT_SECRET is required.');
  const name = value('HOMORA_OIDC_NAME') ?? DEFAULT_NAME;
  if (name.length > 40 || /[\p{Cc}<>]/u.test(name))
    throw new Error('HOMORA_OIDC_NAME must be plain text with up to 40 characters.');

  const localhost = `http://localhost:${webPort}`;
  const candidates = [localhost, `http://127.0.0.1:${webPort}`, ...allowedOrigins];
  const requested = value('HOMORA_OIDC_REDIRECT_ORIGIN');
  const redirectOrigin =
    requested ?? allowedOrigins.find((origin) => origin.startsWith('https://')) ?? localhost;
  if (!candidates.includes(redirectOrigin))
    throw new Error(
      'HOMORA_OIDC_REDIRECT_ORIGIN must be Homora’s local address or one of HOMORA_ALLOWED_ORIGINS.',
    );
  const redirectHost = new URL(redirectOrigin).hostname;
  if (redirectOrigin.startsWith('http://') && !LOOPBACK_HOSTS.has(redirectHost))
    throw new Error('HOMORA_OIDC_REDIRECT_ORIGIN must use HTTPS outside localhost.');

  return {
    issuer,
    clientId,
    clientSecret,
    name,
    redirectOrigin,
  };
}
