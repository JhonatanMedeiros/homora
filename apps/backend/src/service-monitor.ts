import { execFile } from 'node:child_process';
import { CHECK_INTERVAL_DEFAULT, type CheckType, type Service } from '@homora/shared';
import { serviceSignature } from './service-signature.js';
import { authorizeDestination } from './network-policy.js';
import { getAuthorizedResponse } from './network-request.js';

/**
 * Explains service health status. `status` remains high-level summary (available,
 * unavailable, or unknown); `reason` explains probe details.
 */
export type StatusReason =
  | 'responding' // 2xx
  | 'redirect' // 3xx, without following redirect
  | 'login-required' // 401 or 403: responds, but requires credentials
  | 'unexpected-status'
  | 'not-found' // 404
  | 'error-status' // other 4xx and 5xx
  | 'reachable' // successful ICMP ping
  | 'no-response' // network, DNS, TLS failure, unanswered ping, or timeout
  | 'unchecked'; // not yet probed

export type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
  reason: StatusReason;
  /** HTTP status code received; null when no response or not yet checked. */
  httpStatus: number | null;
  /** Latency in milliseconds; null when no response. */
  latencyMs: number | null;
  expectedStatus?: string | null;
};

/** `httpStatus` is null when check was a successful ICMP ping. */
export type CheckResult = { httpStatus: number | null; latencyMs: number };

/** The `ping` binary is missing or cannot be used: this is not a service failure. */
export class PingUnavailableError extends Error {}

/** Translates HTTP status into displayed state. Responding services, even demanding login, are considered online. */
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

const unchecked = (): ServiceStatus => ({
  status: 'unknown',
  lastAttempt: null,
  reason: 'unchecked',
  httpStatus: null,
  latencyMs: null,
});

/** Polling frequency to find due services; each service configures its own interval. */
const tickMs = 10_000;
/** Tolerance buffer so services checked nearly an interval ago do not wait for another tick. */
const dueSlackMs = 2_000;
/** Maximum duration to initiate checks within a cycle; remaining services carry over to next cycle. */
const cycleBudgetMs = 45_000;
const maxConcurrentChecks = 5;

/** Executes an ICMP ping to the authorized, DNS-pinned address from network policy. */
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

/** Uses the shared pinned-DNS destination policy; private ranges require the
 * per-service opt-in and special ranges remain forbidden. */
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

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (
    url: string,
    allowPrivate?: boolean,
    type?: CheckType,
  ) => Promise<CheckResult> = checkService,
  now: () => number = Date.now,
  publish?: (services: Service[], states: Record<number, ServiceStatus>) => void,
) {
  const states = new Map<number, ServiceStatus>();
  /** Configuration each state was measured under, so edited services are probed again and only those. */
  const signatures = new Map<number, string>();
  let running: Promise<void> | undefined;
  let generation = 0;
  let rerunRequested = false;
  let rerunForce = false;

  async function run(force = false) {
    if (running) {
      if (force) {
        rerunRequested = true;
        rerunForce = true;
      }
      return running;
    }
    const runGeneration = generation;
    running = (async () => {
      let current: Service[];
      try {
        current = await getServices();
      } catch {
        // A dashboard read remains usable when monitoring cannot read the DB.
        return;
      }
      if (runGeneration !== generation) return;
      // Publishing rewrites observation rows, so it only happens when something changed.
      let changed = false;
      const currentIds = new Set(current.map(({ id }) => id));
      for (const id of states.keys())
        if (!currentIds.has(id)) {
          states.delete(id);
          signatures.delete(id);
          changed = true;
        }
      for (const service of current) {
        const signature = serviceSignature(service);
        if (states.has(service.id) && signatures.get(service.id) !== signature) {
          // Edited since the last probe: the old result no longer describes this service.
          states.set(service.id, unchecked());
          changed = true;
        }
        if (!states.has(service.id)) {
          states.set(service.id, unchecked());
          changed = true;
        }
        signatures.set(service.id, signature);
      }
      // No fixed quantity limit: oldest (or never probed) run first, and cycle stops
      // initiating checks once time budget is exhausted. Remaining services retain previous
      // state and take precedence in the following cycle.
      const lastOf = (id: number) => states.get(id)?.lastAttempt ?? '';
      const startedAt = now();
      const isDue = (service: Service) => {
        const last = lastOf(service.id);
        if (!last) return true;
        const interval = (service.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 1000;
        return startedAt - Date.parse(last) >= interval - dueSlackMs;
      };
      const monitored = current
        .filter((service) => force || isDue(service))
        .sort((a, b) => lastOf(a.id).localeCompare(lastOf(b.id)));
      let nextIndex = 0;
      await Promise.all(
        Array.from({ length: Math.min(maxConcurrentChecks, monitored.length) }, async () => {
          while (
            nextIndex < monitored.length &&
            runGeneration === generation &&
            now() - startedAt < cycleBudgetMs
          ) {
            const service = monitored[nextIndex++];
            changed = true;
            const attemptedAt = new Date(now()).toISOString();
            try {
              const result = await check(
                service.checkType !== 'ping' && service.checkPath
                  ? new URL(service.checkPath, new URL(service.url).origin).href
                  : service.url,
                service.allowPrivate === true,
                service.checkType ?? 'http',
              );
              if (runGeneration === generation)
                states.set(service.id, {
                  ...(result.httpStatus === null
                    ? { status: 'available' as const, reason: 'reachable' as const }
                    : classify(result.httpStatus, service.expectedStatus)),
                  lastAttempt: attemptedAt,
                  httpStatus: result.httpStatus,
                  ...(result.httpStatus !== null && service.expectedStatus
                    ? { expectedStatus: String(service.expectedStatus) }
                    : {}),
                  latencyMs: result.latencyMs,
                });
            } catch (error) {
              if (runGeneration === generation && error instanceof PingUnavailableError)
                states.set(service.id, { ...unchecked(), lastAttempt: attemptedAt });
              else if (runGeneration === generation)
                states.set(service.id, {
                  status: 'unavailable',
                  lastAttempt: attemptedAt,
                  reason: 'no-response',
                  httpStatus: null,
                  latencyMs: null,
                });
            }
          }
        }),
      );
      if (runGeneration === generation && changed) publish?.(current, Object.fromEntries(states));
    })();
    try {
      await running;
    } finally {
      const rerun = rerunRequested;
      const rerunForced = rerunForce;
      rerunRequested = false;
      rerunForce = false;
      running = undefined;
      if (rerun) void run(rerunForced);
    }
  }

  return {
    run,
    /**
     * Configuration changed. Results of the cycle in progress are discarded and a new cycle
     * starts at once; it probes only services that are new or whose monitoring configuration
     * changed (see `signatures`), not the whole inventory, so one edit costs one check.
     */
    invalidate() {
      generation++;
      if (running) {
        rerunRequested = true;
        return running;
      }
      return run();
    },
    snapshot() {
      return Object.fromEntries(states);
    },
  };
}

export function startServiceMonitor(monitor: ReturnType<typeof createServiceMonitor>) {
  const initial = setTimeout(() => void monitor.run(true), 0);
  const interval = setInterval(() => void monitor.run(), tickMs);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
