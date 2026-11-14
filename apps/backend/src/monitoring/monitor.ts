import { CHECK_INTERVAL_DEFAULT, type CheckType, type Service } from '@homora/shared';
import { isNonHttp } from './probe.js';
import { serviceSignature } from './signature.js';
import { noopLog, type Log } from '../logger.js';
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
/** Fewer measured services than this cannot tell a systemic failure from one broken service. */
const systemicMinServices = 3;

/** The raw reason a check threw, kept out of the public `reason` and out of the API. */
type RawFailure = { code: string | null; message: string };

const rawFailure = (error: unknown): RawFailure => ({
  code:
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null,
  message: error instanceof Error ? error.message : String(error),
});

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (
    url: string,
    allowPrivate?: boolean,
    type?: CheckType,
    match?: string | null,
    now?: () => number,
    options?: { insecureTls?: boolean; ca?: string },
  ) => Promise<CheckResult> = checkService,
  now: () => number = Date.now,
  publish?: (services: Service[], states: Record<number, ServiceStatus>) => void,
  /** Services in a scheduled maintenance window at the given time; they are not probed. */
  inMaintenance: (at: number) => ReadonlySet<number> = () => new Set(),
  trust: () => { bundle: string; hash: string } | null = () => null,
  log: Log = noopLog,
) {
  const states = new Map<number, ServiceStatus>();
  /** Raw failure behind each unavailable state that came from a thrown check. */
  const failures = new Map<number, RawFailure>();
  /** Failure shared by most monitors right now, so the warning is logged once, not every cycle. */
  let systemic: string | null = null;
  let lastCycleAt: number | null = null;
  /** Configuration each state was measured under, so edited services are probed again and only those. */
  const signatures = new Map<number, string>();
  let running: Promise<void> | undefined;
  let generation = 0;
  let rerunRequested = false;
  let rerunForce = false;

  /**
   * One debug line per cycle, and a warning when most measured services fail for the same
   * reason: that points at the monitor's own environment (DNS, network policy, trust store),
   * not at the services.
   */
  function summarize(current: Service[], checked: number, durationMs: number) {
    const byReason: Record<string, number> = {};
    let measured = 0;
    for (const service of current) {
      const state = states.get(service.id);
      if (!state || state.status === 'unknown') continue;
      measured++;
      if (state.status !== 'unavailable') continue;
      const key = failures.get(service.id)?.code ?? state.reason;
      byReason[key] = (byReason[key] ?? 0) + 1;
    }
    log.debug({ checked, measured, failuresByReason: byReason, durationMs }, 'monitor cycle');
    const [topReason, topCount] = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0] ?? [];
    const widespread =
      topReason !== undefined && measured >= systemicMinServices && topCount * 2 > measured;
    if (widespread) {
      if (systemic !== topReason)
        log.warn(
          { reason: topReason, failing: topCount, measured, failuresByReason: byReason },
          `systemic monitoring failure: ${topCount} of ${measured} services fail with ${topReason}`,
        );
      systemic = topReason;
    } else if (systemic !== null) {
      log.info({ previous: systemic, measured }, 'systemic monitoring failure cleared');
      systemic = null;
    }
  }

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
      } catch (error) {
        // A dashboard read remains usable when monitoring cannot read the DB, but the cycle is lost.
        log.error({ err: error }, 'monitor cycle skipped: could not read the services to check');
        return;
      }
      if (runGeneration !== generation) return;
      const ca = trust();
      // Publishing rewrites observation rows, so it only happens when something changed.
      let changed = false;
      const currentIds = new Set(current.map(({ id }) => id));
      for (const id of states.keys())
        if (!currentIds.has(id)) {
          states.delete(id);
          failures.delete(id);
          signatures.delete(id);
          changed = true;
        }
      for (const service of current) {
        const signature = serviceSignature(service, ca?.hash);
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
      let checked = 0;
      /** Stores a measured result and logs it only when the service changed state. */
      const settle = (service: Service, next: ServiceStatus, failure?: RawFailure) => {
        const previous = states.get(service.id);
        states.set(service.id, next);
        if (failure) failures.set(service.id, failure);
        else failures.delete(service.id);
        if (
          previous &&
          previous.status === next.status &&
          (next.status !== 'unavailable' || previous.reason === next.reason)
        )
          return;
        const first = !previous || previous.status === 'unknown';
        const fields = {
          service: service.id,
          name: service.name,
          checkType: service.checkType ?? 'http',
          from: previous?.status ?? 'unknown',
          to: next.status,
          reason: next.reason,
          ...(next.httpStatus !== null ? { httpStatus: next.httpStatus } : {}),
          ...(failure ? { errorCode: failure.code, errorMessage: failure.message } : {}),
        };
        const message = `service ${fields.from} -> ${fields.to}: ${next.reason}`;
        if (next.status === 'unavailable') log.warn(fields, message);
        else if (first) log.debug(fields, message);
        else log.info(fields, message);
      };
      await Promise.all(
        Array.from({ length: Math.min(maxConcurrentChecks, monitored.length) }, async () => {
          while (
            nextIndex < monitored.length &&
            runGeneration === generation &&
            now() - startedAt < cycleBudgetMs
          ) {
            const service = monitored[nextIndex++];
            changed = true;
            checked++;
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
              const target =
                service.checkUrl ??
                (!isNonHttp(service.checkType) && service.checkPath
                  ? new URL(service.checkPath, new URL(service.url).origin).href
                  : service.url);
              const args = [
                target,
                service.allowPrivate === true,
                service.checkType ?? 'http',
                service.checkMatch ?? null,
              ] as const;
              const options = {
                ...(service.checkInsecure ? { insecureTls: true } : {}),
                ...(ca && !service.checkInsecure ? { ca: ca.bundle } : {}),
              };
              const result = Object.keys(options).length
                ? await check(...args, undefined, options)
                : await check(...args);
              if (runGeneration === generation)
                settle(service, {
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
              if (runGeneration === generation && error instanceof PingUnavailableError) {
                states.set(service.id, { ...unchecked(), lastAttempt: attemptedAt });
                log.warn(
                  { service: service.id, name: service.name },
                  'ping check unavailable: the ping binary cannot be used',
                );
              } else if (runGeneration === generation) {
                const failure = rawFailure(error);
                settle(
                  service,
                  {
                    status: 'unavailable',
                    lastAttempt: attemptedAt,
                    reason:
                      service.checkUrl && failure.code === 'destination-disallowed'
                        ? 'destination-blocked'
                        : 'no-response',
                    httpStatus: null,
                    latencyMs: null,
                  },
                  failure,
                );
              }
            }
          }
        }),
      );
      if (runGeneration === generation && changed) publish?.(current, Object.fromEntries(states));
      lastCycleAt = now();
      if (checked > 0) summarize(current, checked, now() - startedAt);
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
    /** When the last cycle completed; null before the first one. `/api/health` reports its age. */
    health() {
      return { lastCycleAt };
    },
    /** Raw reason of the last thrown check per service, for diagnostics; never sent to clients. */
    lastFailure(id: number) {
      return failures.get(id);
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
