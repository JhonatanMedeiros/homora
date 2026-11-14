import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Acknowledgement } from '@/lib/acknowledgements';

type Marks = Record<number, Acknowledgement>;

// One copy shared by everything on screen (the Home and the bell), so a mark made in one place
// shows in the other at once.
let marks: Marks = {};
const listeners = new Set<() => void>();
const publish = (next: Marks) => {
  marks = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

async function load() {
  try {
    const response = await fetch('/api/acknowledgements');
    if (!response.ok) return;
    const data = (await response.json()) as unknown;
    if (data && typeof data === 'object' && !Array.isArray(data)) publish(data as Marks);
  } catch {
    /* Auxiliary: without it nothing is quieted, which is the safe side. */
  }
}

const json = { 'Content-Type': 'application/json' };

/** Marks put on offline services ("seen" or muted for a while), refreshed every minute. */
export function useAcknowledgements() {
  const current = useSyncExternalStore(subscribe, () => marks);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const acknowledge = useCallback(
    async (ids: number[], incidents: Record<number, number | undefined>, muteMinutes?: number) => {
      try {
        const responses = await Promise.all(
          ids.map((id) =>
            fetch(`/api/services/${id}/acknowledgement`, {
              method: 'PUT',
              headers: json,
              body: JSON.stringify({
                incidentId: incidents[id] ?? null,
                ...(muteMinutes ? { muteMinutes } : {}),
              }),
            }),
          ),
        );
        await load();
        return responses.every((response) => response.ok);
      } catch {
        return false;
      }
    },
    [],
  );
  const clear = useCallback(async (ids: number[]) => {
    try {
      const responses = await Promise.all(
        ids.map((id) => fetch(`/api/services/${id}/acknowledgement`, { method: 'DELETE' })),
      );
      await load();
      return responses.every((response) => response.ok);
    } catch {
      return false;
    }
  }, []);
  return { marks: current, acknowledge, clear };
}
