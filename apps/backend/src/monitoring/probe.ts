import { execFile } from 'node:child_process';
import { BODY_CHECK_TYPES, CERT_WARNING_DAYS, type CheckType } from '@homora/shared';
import { CONTENT_CHECK_MAX_BYTES, matchesJson, matchesKeyword } from './check-body.js';
import { readCertificate, tcpConnect } from './network-checks.js';
import { authorizeDestination, isPrivateDestination } from '../network-policy.js';
import { getAuthorizedResponse } from '../network-request.js';

/** Explains probe details beneath the monitor's high-level availability state. */
export type StatusReason =
  | 'responding'
  | 'redirect'
  | 'login-required'
  | 'unexpected-status'
  | 'not-found'
  | 'error-status'
  | 'reachable'
  | 'destination-blocked'
  | 'no-response'
  | 'content-mismatch' // answered, but the expected keyword or JSON value is missing
  | 'cert-expired' // the TLS certificate is past its expiry
  | 'cert-invalid' // the TLS certificate is not trusted or does not match the host
  | 'cert-expiring' // valid, but expires within the warning period
  | 'maintenance' // inside a scheduled maintenance window: not probed, not counted
  | 'unchecked';

export type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
  reason: StatusReason;
  httpStatus: number | null;
  latencyMs: number | null;
  expectedStatus?: string | null;
  /** TLS checks: when the certificate the server presents expires (epoch milliseconds). */
  certExpiresAt?: number;
  /** Set only for display, while a measurement failure keeps this monitor from being read. */
  unmeasured?: boolean;
};

export { CERT_WARNING_DAYS };

/**
 * `httpStatus` is null for checks that are not HTTP (ping, TCP, DNS, TLS). `outcome` is set when
 * the check itself decides the state, such as a missing keyword or an expired certificate.
 */
export type CheckResult = {
  httpStatus: number | null;
  latencyMs: number;
  outcome?: Pick<ServiceStatus, 'status' | 'reason'>;
  certExpiresAt?: number;
};

/** The `ping` binary is missing or cannot be used: this is not a service failure. */
export class PingUnavailableError extends Error {}

/** Translates HTTP status into displayed state. Responding services, even demanding login, are online. */
export function classify(
  httpStatus: number,
  expected?: string | number | null,
): Pick<ServiceStatus, 'status' | 'reason'> {
  if (expected) {
    const matches =
      String(expected) === String(httpStatus) ||
      (expected === '2xx' && httpStatus >= 200 && httpStatus < 300) ||
      (expected === '3xx' && httpStatus >= 300 && httpStatus < 400);
    return matches
      ? { status: 'available', reason: 'responding' }
      : { status: 'unavailable', reason: 'unexpected-status' };
  }
  if (httpStatus >= 200 && httpStatus < 300) return { status: 'available', reason: 'responding' };
  if (httpStatus >= 300 && httpStatus < 400) return { status: 'available', reason: 'redirect' };
  if (httpStatus === 401 || httpStatus === 403)
    return { status: 'available', reason: 'login-required' };
  if (httpStatus === 404) return { status: 'unavailable', reason: 'not-found' };
  return { status: 'unavailable', reason: 'error-status' };
}

/** Executes ICMP against the authorized, DNS-pinned address from network policy. */
function ping(address: string, family: number): Promise<CheckResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    // No shell: address is a validated IP passed as an isolated argument.
    execFile(
      'ping',
      [family === 6 ? '-6' : '-4', '-c', '1', '-W', '2', '-n', address],
      { timeout: 5000 },
      (error, stdout) => {
        if (error) {
          reject(
            // ENOENT: missing binary; 126: permission denied (e.g. container lacking NET_RAW).
            (error as { code?: unknown }).code === 'ENOENT' ||
              (error as { code?: unknown }).code === 126
              ? new PingUnavailableError()
              : new Error('No response to ping.'),
          );
          return;
        }
        const reported = /time[=<]\s*([\d.]+)\s*ms/.exec(stdout)?.[1];
        resolve({
          httpStatus: null,
          latencyMs: Math.round(reported ? Number(reported) : Date.now() - startedAt),
        });
      },
    );
  });
}

/** Types that connect to the host instead of requesting a page, so a check path means nothing. */
export const isNonHttp = (type?: CheckType) =>
  type === 'ping' || type === 'tcp' || type === 'dns' || type === 'tls';

/** Port of a URL, with the scheme's default when it is left out. */
const portOf = (url: URL) => Number(url.port) || (url.protocol === 'https:' ? 443 : 80);

/** Uses the shared pinned-DNS destination policy; private ranges require the
 * per-service opt-in and special ranges remain forbidden. Every check type goes through it. */
export async function checkService(
  url: string,
  allowPrivate = false,
  type: CheckType = 'http',
  match: string | null = null,
  now: () => number = Date.now,
  options: { ca?: string; insecureTls?: boolean } = {},
): Promise<CheckResult> {
  const policy = { origins: [new URL(url).origin], allowPrivate };
  if (isNonHttp(type)) {
    const startedAt = Date.now();
    const { address, url: target } = await authorizeDestination(url, policy);
    // The lookup above is the whole DNS check: it fails when the name does not resolve or points
    // somewhere the policy refuses.
    if (type === 'dns') return { httpStatus: null, latencyMs: Date.now() - startedAt };
    if (type === 'ping') return ping(address.address, address.family);
    const port = portOf(target);
    if (type === 'tcp')
      return { httpStatus: null, latencyMs: await tcpConnect(address.address, port) };
    const privateCa =
      options.ca && allowPrivate && isPrivateDestination(address.address) ? options.ca : undefined;
    const insecureTls =
      options.insecureTls === true && allowPrivate && isPrivateDestination(address.address);
    const hostname = target.hostname.replaceAll(/^\[|\]$/g, '');
    const certificate = privateCa
      ? await readCertificate(address.address, hostname, port, undefined, privateCa)
      : await readCertificate(address.address, hostname, port);
    const daysLeft = (certificate.validTo - now()) / 86_400_000;
    const outcome: CheckResult['outcome'] =
      !insecureTls && (certificate.validTo <= now() || certificate.error === 'CERT_HAS_EXPIRED')
        ? { status: 'unavailable', reason: 'cert-expired' }
        : !certificate.authorized && !insecureTls
          ? { status: 'unavailable', reason: 'cert-invalid' }
          : daysLeft <= CERT_WARNING_DAYS
            ? { status: 'available', reason: 'cert-expiring' }
            : { status: 'available', reason: 'reachable' };
    return {
      httpStatus: null,
      latencyMs: certificate.latencyMs,
      outcome,
      certExpiresAt: certificate.validTo,
    };
  }
  const startedAt = Date.now();
  const body = BODY_CHECK_TYPES.includes(type) && Boolean(match);
  const httpLike = type === 'http' || BODY_CHECK_TYPES.includes(type);
  const response = await getAuthorizedResponse(url, policy, {
    timeoutMs: 8000,
    reportRedirect: true,
    ...(httpLike && options.ca ? { privateCa: options.ca } : {}),
    ...(httpLike && options.insecureTls ? { privateInsecureTls: true } : {}),
    ...(body ? { maxBodyBytes: CONTENT_CHECK_MAX_BYTES } : {}),
  });
  const result: CheckResult = { httpStatus: response.status, latencyMs: Date.now() - startedAt };
  if (body && match && response.status >= 200 && response.status < 300) {
    const found =
      type === 'json' ? matchesJson(response.body, match) : matchesKeyword(response.body, match);
    if (!found) result.outcome = { status: 'unavailable', reason: 'content-mismatch' };
  }
  return result;
}
