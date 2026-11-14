import { useCallback, useSyncExternalStore } from 'react';
import { UPTIME_RANGES, type UptimeRange } from '@homora/shared';

/** Compact tiles (default), dense rows, or full cards. Compact is saved as `tiles`: `compact` is a legacy name for list. */
export type View = 'tiles' | 'list' | 'cards';
/** How Home arranges services: by group (default) or by the infrastructure host they run on. */
export type Arrange = 'group' | 'host' | 'map';
const VIEW_KEY = 'homora-density';
const DESCRIPTIONS_KEY = 'homora-descriptions';
const UPTIME_RANGE_KEY = 'homora-uptime-range';
const ARRANGE_KEY = 'homora-arrange';
const COLLAPSE_HEALTHY_KEY = 'homora-collapse-healthy';
const PROBLEMS_FIRST_KEY = 'homora-problems-first';
const WIDGET_RAIL_KEY = 'homora-widget-rail';

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

/** Reads the saved view; 'comfortable' (older value) maps to cards, an old 'compact' to list, nothing saved to tiles. */
function currentView(): View {
  const saved = read(VIEW_KEY);
  if (saved === null || saved === 'tiles') return 'tiles';
  return saved === 'cards' || saved === 'comfortable' ? 'cards' : 'list';
}
const currentRange = (): UptimeRange =>
  UPTIME_RANGES.find((range) => range === read(UPTIME_RANGE_KEY)) ?? '24h';
const currentArrange = (): Arrange => {
  const saved = read(ARRANGE_KEY);
  return saved === 'host' || saved === 'map' ? saved : 'group';
};
const currentDescriptions = () => read(DESCRIPTIONS_KEY) !== 'hidden';
const currentCollapseHealthy = () => read(COLLAPSE_HEALTHY_KEY) === 'on';
const currentProblemsFirst = () => read(PROBLEMS_FIRST_KEY) === 'on';
/** The widgets sit in a side rail unless the person moved them back above the services. */
const currentWidgetRail = () => read(WIDGET_RAIL_KEY) !== 'off';

/** Home view preferences (tiles, list or cards, descriptions, uptime period, group handling), saved in this browser. */
export function useViewPreferences() {
  const view = useSyncExternalStore(subscribe, currentView, () => 'tiles' as View);
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
  const collapseHealthy = useSyncExternalStore(subscribe, currentCollapseHealthy, () => false);
  const setCollapseHealthy = useCallback((next: boolean) => {
    write(COLLAPSE_HEALTHY_KEY, next ? 'on' : 'off');
    notify();
  }, []);
  const problemsFirst = useSyncExternalStore(subscribe, currentProblemsFirst, () => false);
  const setProblemsFirst = useCallback((next: boolean) => {
    write(PROBLEMS_FIRST_KEY, next ? 'on' : 'off');
    notify();
  }, []);
  const widgetRail = useSyncExternalStore(subscribe, currentWidgetRail, () => true);
  const setWidgetRail = useCallback((next: boolean) => {
    write(WIDGET_RAIL_KEY, next ? 'on' : 'off');
    notify();
  }, []);
  return {
    view,
    setView,
    widgetRail,
    setWidgetRail,
    collapseHealthy,
    setCollapseHealthy,
    problemsFirst,
    setProblemsFirst,
    arrange,
    setArrange,
    showDescriptions,
    setShowDescriptions,
    uptimeRange,
    setUptimeRange,
  };
}
