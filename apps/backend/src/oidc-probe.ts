/**
 * A health check of the configured provider, never part of a sign-in: Better Auth does its own
 * discovery and verification. It answers whether a sign-in could work now, so that the button and
 * the automatic redirect are offered only then, and names what is wrong otherwise.
 */
export type OidcProbeFailure = 'unreachable' | 'issuer' | 'endpoints' | 'signing';

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 256 * 1024;

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || !response.body) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) return null;
      chunks.push(chunk);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The address Better Auth reads the provider from. */
export const oidcDiscoveryUrl = (issuer: string) =>
  `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;

/** Null when a sign-in can work. */
export async function probeOidcProvider(issuer: string): Promise<OidcProbeFailure | null> {
  const discovery = await readJson(oidcDiscoveryUrl(issuer));
  if (!discovery) return 'unreachable';
  if (discovery.issuer !== issuer) return 'issuer';
  // An HTTPS provider must not send the client secret or the keys over plain HTTP.
  const secure = issuer.startsWith('https://');
  const endpoints = ['authorization_endpoint', 'token_endpoint', 'jwks_uri'].map(
    (name) => discovery[name],
  );
  if (
    endpoints.some(
      (url) => typeof url !== 'string' || !(secure ? /^https:\/\//i : /^https?:\/\//i).test(url),
    )
  )
    return 'endpoints';
  // Signatures are checked against published keys: HMAC (`HS*`, the client secret) never passes.
  const algorithms = discovery.id_token_signing_alg_values_supported;
  if (Array.isArray(algorithms) && algorithms.every((name) => String(name).startsWith('HS')))
    return 'signing';
  const keys = await readJson(endpoints[2] as string);
  if (!keys) return 'unreachable';
  return Array.isArray(keys.keys) && keys.keys.length > 0 ? null : 'signing';
}
