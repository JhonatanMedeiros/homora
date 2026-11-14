import type { Service } from '@homora/shared';
import type { ServiceStatus } from '../monitoring/index.js';
import { serviceSignature } from '../monitoring/index.js';

export type NotificationEvent = {
  event: 'down' | 'up';
  service: { id: number; name: string; category: string };
  status: 'available' | 'unavailable';
  reason: ServiceStatus['reason'];
  httpStatus: number | null;
  latencyMs: number | null;
  at: string;
};

export type Previous = {
  signature: string;
  attempt: string;
  status: 'available' | 'unavailable' | 'unknown';
  lastDown: number | null;
  notifiedDown: boolean;
  /** Consecutive failed checks in the current streak (anti-flapping); absent in older saved state. */
  failures?: number;
  /** Consecutive successful checks since the last failure while an outage is open. */
  oks?: number;
};

/** How many consecutive checks must agree before an alert is sent; 1 alerts on the first change. */
export type AlertThresholds = (serviceId: number) => {
  failureThreshold: number;
  recoveryThreshold: number;
};
const immediately: AlertThresholds = () => ({ failureThreshold: 1, recoveryThreshold: 1 });

/** Ignores repeated publications and preserves the last known status through unknown checks. */
export function createNotificationTransitions(
  cooldownMs = 5 * 60_000,
  initial: Iterable<[number, Previous]> = [],
  thresholds: AlertThresholds = immediately,
) {
  const previous = new Map<number, Previous>(initial);
  return {
    snapshot() {
      return [...previous.entries()];
    },
    observe(services: Service[], states: Record<number, ServiceStatus>): NotificationEvent[] {
      // invalidate() publishes an empty snapshot before checking again; it is not a deletion.
      if (!services.length) return [];
      const ids = new Set(services.map(({ id }) => id));
      for (const id of previous.keys()) if (!ids.has(id)) previous.delete(id);
      const events: NotificationEvent[] = [];
      for (const service of services) {
        const current = states[service.id];
        if (!current?.lastAttempt) continue;
        const signature = serviceSignature(service);
        let old = previous.get(service.id);
        if (old?.signature !== signature) old = undefined;
        if (old && current.lastAttempt <= old.attempt) continue;
        const state: Previous = old
          ? { ...old, attempt: current.lastAttempt }
          : {
              signature,
              attempt: current.lastAttempt,
              status: 'unknown',
              lastDown: null,
              notifiedDown: false,
            };
        if (current.status !== 'unknown') {
          let event: 'down' | 'up' | undefined;
          const at = Date.parse(current.lastAttempt);
          const { failureThreshold, recoveryThreshold } = thresholds(service.id);
          if (current.status === 'unavailable') {
            // State saved before thresholds existed counts an open outage as already past its threshold.
            const failures =
              (state.failures ?? (state.status === 'unavailable' ? failureThreshold : 0)) + 1;
            state.failures = failures;
            state.oks = 0;
            // Only the check that reaches the threshold alerts, so a long outage alerts once.
            if (
              failures === failureThreshold &&
              (state.lastDown === null || at - state.lastDown >= cooldownMs)
            ) {
              event = 'down';
              state.lastDown = at;
              state.notifiedDown = true;
            }
            state.status = 'unavailable';
          } else if (state.status === 'unavailable') {
            const oks = (state.oks ?? 0) + 1;
            state.oks = oks;
            if (oks >= recoveryThreshold) {
              if (state.notifiedDown) event = 'up';
              state.notifiedDown = false;
              state.status = 'available';
              state.failures = 0;
              state.oks = 0;
            }
          } else {
            state.status = 'available';
            state.failures = 0;
            state.oks = 0;
          }
          if (event)
            events.push({
              event,
              service: { id: service.id, name: service.name, category: service.category },
              status: current.status,
              reason: current.reason,
              httpStatus: current.httpStatus,
              latencyMs: current.latencyMs,
              at: current.lastAttempt,
            });
        }
        previous.set(service.id, state);
      }
      return events;
    },
  };
}
