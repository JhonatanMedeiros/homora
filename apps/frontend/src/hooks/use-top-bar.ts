import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'homora-top-bar';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

/** Browser-local preference to display the top telemetry bar. Disabled by default. */
export function useTopBar(): [boolean, (value: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Without storage: preference is retained in-memory only.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, set];
}
