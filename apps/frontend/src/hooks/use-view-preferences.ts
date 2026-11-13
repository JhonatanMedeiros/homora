import { useCallback, useSyncExternalStore } from 'react';
import { UPTIME_RANGES, type UptimeRange } from '@homora/shared';

export type View = 'list' | 'cards';
/** How Home arranges services: by group (default) or by the infrastructure host they run on. */
export type Arrange = 'group' | 'host' | 'map';
const VIEW_KEY = 'homora-density';
const DESCRIPTIONS_KEY = 'homora-descriptions';
const UPTIME_RANGE_KEY = 'homora-uptime-range';
const ARRANGE_KEY = 'homora-arrange';

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
const currentRange = (): UptimeRange =>
  UPTIME_RANGES.find((range) => range === read(UPTIME_RANGE_KEY)) ?? '24h';
const currentArrange = (): Arrange => {
  const saved = read(ARRANGE_KEY);
  return saved === 'host' || saved === 'map' ? saved : 'group';
};
const currentDescriptions = () => read(DESCRIPTIONS_KEY) !== 'hidden';

/** Home view preferences (list or cards, descriptions, uptime period), saved in this browser. */
export function useViewPreferences() {
  const view = useSyncExternalStore(subscribe, currentView, () => 'list' as View);
  const showDescriptions = useSyncExternalStore(subscribe, currentDescriptions, () => true);
  const arrange = useSyncExternalStore(subscribe, currentArrange, () => 'group' as Arrange);
  const setArrange = useCallback((next: Arrange) => {
    write(ARRANGE_KEY, next);
    notify();
  }, []);
  const uptimeRange = useSyncExternalStore(subscribe, currentRange, () => '24h' as UptimeRange);
  const setUptimeRange = useCallback((next: UptimeRange) => {
    write(UPTIME_RANGE_KEY, next);
    notify();
  }, []);
  const setView = useCallback((next: View) => {
    write(VIEW_KEY, next);
    notify();
  }, []);
  const setShowDescriptions = useCallback((next: boolean) => {
    write(DESCRIPTIONS_KEY, next ? 'visible' : 'hidden');
    notify();
  }, []);
  return {
    view,
    setView,
    arrange,
    setArrange,
    showDescriptions,
    setShowDescriptions,
    uptimeRange,
    setUptimeRange,
  };
}
