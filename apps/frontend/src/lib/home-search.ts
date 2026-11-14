import { useSyncExternalStore } from 'react';

/**
 * The text typed in the top bar's search field. It lives outside React state because the field is
 * in the shell and the list it filters is on the Home. Cleared when the Home is left.
 */
let text = '';
const listeners = new Set<() => void>();

export function setHomeSearch(next: string) {
  if (next === text) return;
  text = next;
  listeners.forEach((listener) => listener());
}

export function useHomeSearch(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => text,
    () => '',
  );
}
