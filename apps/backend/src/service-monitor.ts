import type { Service } from '@homora/shared';
import { getAuthorizedResponse } from './network-request.js';

export type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
};

const intervalMs = 60_000;
const cacheMs = 60_000;
const maxServicesPerRun = 25;
const maxConcurrentChecks = 5;

/** Checks are deliberately limited to public DNS destinations. Private access
 * needs a separately defined, explicit policy before monitoring can use it. */
export async function checkPublicService(url: string): Promise<boolean> {
  const response = await getAuthorizedResponse(
    url,
    {
      origins: [new URL(url).origin],
      allowPrivate: false,
    },
    { timeoutMs: 8000 },
  );
  return response.status >= 200 && response.status < 300;
}

export function createServiceMonitor(
  getServices: () => Promise<Service[]>,
  check: (url: string) => Promise<boolean> = checkPublicService,
  now: () => number = Date.now,
) {
  const states = new Map<number, ServiceStatus>();
  let lastRun = 0;
  let running: Promise<void> | undefined;
  let generation = 0;
  let rerunRequested = false;

  async function run(force = false) {
    if (!force && now() - lastRun < cacheMs) return;
    if (running) {
      if (force) rerunRequested = true;
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
      const currentIds = new Set(current.map(({ id }) => id));
      for (const id of states.keys()) if (!currentIds.has(id)) states.delete(id);
      for (const service of current)
        states.set(service.id, { status: 'unknown', lastAttempt: null });
      const monitored = current.slice(0, maxServicesPerRun);
      let nextIndex = 0;
      await Promise.all(
        Array.from({ length: Math.min(maxConcurrentChecks, monitored.length) }, async () => {
          while (nextIndex < monitored.length && runGeneration === generation) {
            const service = monitored[nextIndex++];
            const attemptedAt = new Date(now()).toISOString();
            try {
              const available = await check(service.url);
              if (runGeneration === generation)
                states.set(service.id, {
                  status: available ? 'available' : 'unavailable',
                  lastAttempt: attemptedAt,
                });
            } catch {
              if (runGeneration === generation)
                states.set(service.id, { status: 'unavailable', lastAttempt: attemptedAt });
            }
          }
        }),
      );
      if (runGeneration === generation) lastRun = now();
    })();
    try {
      await running;
    } finally {
      const rerun = rerunRequested;
      rerunRequested = false;
      running = undefined;
      if (rerun) void run(true);
    }
  }

  return {
    run,
    invalidate() {
      generation++;
      lastRun = 0;
      states.clear();
      return run(true);
    },
    snapshot() {
      return Object.fromEntries(states);
    },
  };
}

export function startServiceMonitor(monitor: ReturnType<typeof createServiceMonitor>) {
  const initial = setTimeout(() => void monitor.run(true), 0);
  const interval = setInterval(() => void monitor.run(), intervalMs);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
