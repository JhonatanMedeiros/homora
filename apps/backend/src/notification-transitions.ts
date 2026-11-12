import type { Service } from '@homora/shared';
import type { ServiceStatus } from './service-monitor.js';
import { serviceSignature } from './service-signature.js';

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
};

/** Ignores repeated publications and preserves the last known status through unknown checks. */
export function createNotificationTransitions(
  cooldownMs = 5 * 60_000,
  initial: Iterable<[number, Previous]> = [],
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
          if (current.status === 'unavailable' && state.status !== 'unavailable') {
            if (state.lastDown === null || at - state.lastDown >= cooldownMs) {
              event = 'down';
              state.lastDown = at;
              state.notifiedDown = true;
            }
          } else if (current.status === 'available' && state.status === 'unavailable') {
            if (state.notifiedDown) event = 'up';
            state.notifiedDown = false;
          }
          state.status = current.status;
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
