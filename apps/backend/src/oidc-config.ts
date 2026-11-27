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

export type OidcProvider = Omit<OidcConfig, 'redirectOrigin'>;

/** The label shown when the provider has no name of its own. */
export const oidcProviderName = (name: string | undefined) => name?.trim() || DEFAULT_NAME;

/** Which field of a provider is invalid; the message names it for the startup log. */
export class OidcFieldError extends Error {
  field: 'issuer' | 'clientId' | 'clientSecret' | 'name';
  constructor(field: OidcFieldError['field'], message: string) {
    super(message);
    this.name = 'OidcFieldError';
    this.field = field;
  }
}

/**
 * Validates the provider fields, from the environment or from the interface. The issuer is kept
 * exactly as written: the provider's `issuer` must match it character for character (some use a
 * trailing slash, some do not).
 */
export function validateOidcIssuer(issuer: string, { allowLoopbackHttp = false } = {}) {
  let url: URL | null = null;
  try {
    url = new URL(issuer);
  } catch {
    // Reported below.
  }
  const loopback =
    allowLoopbackHttp && url?.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (
    !url ||
    issuer.length > 2048 ||
    (url.protocol !== 'https:' && !loopback) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new OidcFieldError(
      'issuer',
      'HOMORA_OIDC_ISSUER must be an HTTPS URL without credentials, query or fragment.',
    );
}

export function validateOidcClientId(clientId: string | undefined) {
  if (!clientId || clientId.length > 256 || /[\r\n]/.test(clientId))
    throw new OidcFieldError('clientId', 'HOMORA_OIDC_CLIENT_ID is required.');
}

export function validateOidcClientSecret(secret: string | undefined) {
  if (!secret || secret.length > 1024 || /[\r\n]/.test(secret))
    throw new OidcFieldError('clientSecret', 'HOMORA_OIDC_CLIENT_SECRET is required.');
}

export function validateOidcName(name: string) {
  if (name.length > 40 || /[\p{Cc}<>]/u.test(name))
    throw new OidcFieldError(
      'name',
      'HOMORA_OIDC_NAME must be plain text with up to 40 characters.',
    );
}

type OriginContext = { webPort: number; allowedOrigins: readonly string[] };

/**
 * The one origin the browser uses to reach Homora and the provider redirects back to. It is never
 * taken from a request, and it also decides whether the temporary cookies are `Secure`.
 */
export function resolveOidcRedirectOrigin(
  env: NodeJS.ProcessEnv,
  { webPort, allowedOrigins }: OriginContext,
) {
  const localhost = `http://localhost:${webPort}`;
  const candidates = [localhost, `http://127.0.0.1:${webPort}`, ...allowedOrigins];
  const requested = env.HOMORA_OIDC_REDIRECT_ORIGIN?.trim() || undefined;
  const redirectOrigin =
    requested ?? allowedOrigins.find((origin) => origin.startsWith('https://')) ?? localhost;
  if (!candidates.includes(redirectOrigin))
    throw new Error(
      'HOMORA_OIDC_REDIRECT_ORIGIN must be Homora’s local address or one of HOMORA_ALLOWED_ORIGINS.',
    );
  const redirectHost = new URL(redirectOrigin).hostname;
  if (redirectOrigin.startsWith('http://') && !LOOPBACK_HOSTS.has(redirectHost))
    throw new Error('HOMORA_OIDC_REDIRECT_ORIGIN must use HTTPS outside localhost.');
  return redirectOrigin;
}

/**
 * Reads the provider defined by the environment (ADR 0032). There is none unless
 * `HOMORA_OIDC_ISSUER` is set; a partial configuration fails at startup instead of leaving a
 * half-working sign-in. A provider saved in the interface takes precedence over this one.
 */
export function parseOidcConfig(
  env: NodeJS.ProcessEnv,
  context: OriginContext,
): OidcConfig | undefined {
  const value = (name: string) => env[name]?.trim() || undefined;
  const names = [
    'HOMORA_OIDC_ISSUER',
    'HOMORA_OIDC_CLIENT_ID',
    'HOMORA_OIDC_CLIENT_SECRET',
    'HOMORA_OIDC_NAME',
  ];
  const issuer = value('HOMORA_OIDC_ISSUER');
  if (!issuer) {
    if (names.some((name) => value(name)))
      throw new Error('HOMORA_OIDC_ISSUER is required when any other HOMORA_OIDC_* is set.');
    return undefined;
  }
  validateOidcIssuer(issuer);
  const clientId = value('HOMORA_OIDC_CLIENT_ID');
  const clientSecret = env.HOMORA_OIDC_CLIENT_SECRET;
  validateOidcClientId(clientId);
  validateOidcClientSecret(clientSecret);
  const name = oidcProviderName(env.HOMORA_OIDC_NAME);
  validateOidcName(name);
  return {
    issuer,
    clientId: clientId!,
    clientSecret: clientSecret!,
    name,
    redirectOrigin: resolveOidcRedirectOrigin(env, context),
  };
}
