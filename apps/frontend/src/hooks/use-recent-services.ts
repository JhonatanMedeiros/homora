import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'homora-recent-services';
export const MAX_RECENT = 5;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

/** Parses the saved list defensively: only positive integers, no duplicates, at most MAX_RECENT. */
export function parseRecent(raw: string): number[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = value.filter(
      (id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
    );
    return [...new Set(ids)].slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

// The raw string is the snapshot, so React compares by value and does not loop on new arrays.
let memo: { raw: string; ids: number[] } = { raw: '[]', ids: [] };
function snapshot(): number[] {
  const raw = read();
  if (raw !== memo.raw) memo = { raw, ids: parseRecent(raw) };
  return memo.ids;
}
const empty: number[] = [];

/** Last services opened from the command palette, newest first, saved in this browser. */
export function useRecentServices() {
  const recent = useSyncExternalStore(subscribe, snapshot, () => empty);
  const remember = useCallback((id: number) => {
    const next = [id, ...parseRecent(read()).filter((item) => item !== id)].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Recents only last for this page session.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return { recent, remember };
}
