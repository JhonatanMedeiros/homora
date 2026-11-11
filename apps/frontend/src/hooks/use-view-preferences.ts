import { useCallback, useSyncExternalStore } from 'react';

export type View = 'list' | 'cards';
const VIEW_KEY = 'homora-density';
const DESCRIPTIONS_KEY = 'homora-descriptions';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notify = () => listeners.forEach((listener) => listener());

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference only applies to this page session.
  }
}

/** Reads the saved view; 'comfortable' (older value) maps to cards, anything else to list. */
function currentView(): View {
  const saved = read(VIEW_KEY);
  return saved === 'cards' || saved === 'comfortable' ? 'cards' : 'list';
}
const currentDescriptions = () => read(DESCRIPTIONS_KEY) !== 'hidden';

/** Home view preferences (list or cards, descriptions), saved in this browser. */
export function useViewPreferences() {
  const view = useSyncExternalStore(subscribe, currentView, () => 'list' as View);
  const showDescriptions = useSyncExternalStore(subscribe, currentDescriptions, () => true);
  const setView = useCallback((next: View) => {
    write(VIEW_KEY, next);
    notify();
  }, []);
  const setShowDescriptions = useCallback((next: boolean) => {
    write(DESCRIPTIONS_KEY, next ? 'visible' : 'hidden');
    notify();
  }, []);
  return { view, setView, showDescriptions, setShowDescriptions };
}
