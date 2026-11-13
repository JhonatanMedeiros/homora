import { execFile } from 'node:child_process';
import { type CheckType } from '@homora/shared';
import { authorizeDestination } from './network-policy.js';
import { getAuthorizedResponse } from './network-request.js';

/** Explains probe details beneath the monitor's high-level availability state. */
export type StatusReason =
  | 'responding'
  | 'redirect'
  | 'login-required'
  | 'unexpected-status'
  | 'not-found'
  | 'error-status'
  | 'reachable'
  | 'no-response'
  | 'unchecked';

export type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
  reason: StatusReason;
  httpStatus: number | null;
  latencyMs: number | null;
  expectedStatus?: string | null;
};

export type CheckResult = { httpStatus: number | null; latencyMs: number };

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

/** Uses pinned DNS and an explicit per-service private-network opt-in. */
export async function checkService(
  url: string,
  allowPrivate = false,
  type: CheckType = 'http',
): Promise<CheckResult> {
  const policy = { origins: [new URL(url).origin], allowPrivate };
  if (type === 'ping') {
    const { address } = await authorizeDestination(url, policy);
    return ping(address.address, address.family);
  }
  const startedAt = Date.now();
  const response = await getAuthorizedResponse(url, policy, {
    timeoutMs: 8000,
    reportRedirect: true,
  });
  return { httpStatus: response.status, latencyMs: Date.now() - startedAt };
}
