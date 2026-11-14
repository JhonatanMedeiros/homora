import { useSyncExternalStore } from 'react';

/** True while the viewport is at least `px` wide. Server and first render assume a wide screen. */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const query = window.matchMedia(`(min-width: ${px}px)`);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () =>
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(min-width: ${px}px)`).matches
        : true,
    () => true,
  );
}
