import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'homora-shortcuts';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Browser-local switch for the single-key shortcuts (WCAG 2.1.4). On by default. */
export function useShortcutsPreference(): [boolean, (value: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((value: boolean) => {
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off');
    } catch {
      // Without storage the choice only lasts until reload.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [enabled, set];
}
