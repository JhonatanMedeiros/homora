import { CHECK_INTERVAL_DEFAULT, type CheckType, type Service } from '@homora/shared';
import { isNonHttp } from './probe.js';
import { serviceSignature } from './signature.js';
import {
  classify,
  checkService,
  PingUnavailableError,
  type CheckResult,
  type ServiceStatus,
} from './probe.js';

export { classify, checkService, PingUnavailableError, CERT_WARNING_DAYS } from './probe.js';
export type { CheckResult, ServiceStatus, StatusReason } from './probe.js';

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

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (
    url: string,
    allowPrivate?: boolean,
    type?: CheckType,
    match?: string | null,
  ) => Promise<CheckResult> = checkService,
  now: () => number = Date.now,
  publish?: (services: Service[], states: Record<number, ServiceStatus>) => void,
  /** Services in a scheduled maintenance window at the given time; they are not probed. */
  inMaintenance: (at: number) => ReadonlySet<number> = () => new Set(),
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
      const paused = inMaintenance(startedAt);
      const isDue = (service: Service) => {
        const last = lastOf(service.id);
        if (!last) return true;
        // Entering or leaving a maintenance window shows at once, not at the next interval.
        if (paused.has(service.id) !== (states.get(service.id)?.reason === 'maintenance'))
          return true;
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
            if (paused.has(service.id)) {
              states.set(service.id, {
                status: 'unknown',
                lastAttempt: attemptedAt,
                reason: 'maintenance',
                httpStatus: null,
                latencyMs: null,
              });
              continue;
            }
            try {
              const result = await check(
                service.checkUrl ??
                  (!isNonHttp(service.checkType) && service.checkPath
                    ? new URL(service.checkPath, new URL(service.url).origin).href
                    : service.url),
                service.allowPrivate === true,
                service.checkType ?? 'http',
                service.checkMatch ?? null,
              );
              if (runGeneration === generation)
                states.set(service.id, {
                  ...(result.outcome ??
                    (result.httpStatus === null
                      ? { status: 'available' as const, reason: 'reachable' as const }
                      : classify(result.httpStatus, service.expectedStatus))),
                  ...(result.certExpiresAt ? { certExpiresAt: result.certExpiresAt } : {}),
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
                  reason:
                    service.checkUrl &&
                    error instanceof Error &&
                    'code' in error &&
                    error.code === 'destination-disallowed'
                      ? 'destination-blocked'
                      : 'no-response',
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
