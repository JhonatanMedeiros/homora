import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_ENGINE,
  engineTemplate,
  isEngineChoice,
  templateProblem,
  type EngineChoice,
} from '@/lib/web-search';

const ENABLED_KEY = 'homora-web-search';
const ENGINE_KEY = 'homora-web-search-engine';
const CUSTOM_KEY = 'homora-web-search-url';

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the choice only lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

const currentEnabled = () => read(ENABLED_KEY) === 'on';
const currentEngine = (): EngineChoice => {
  const saved = read(ENGINE_KEY);
  return isEngineChoice(saved) ? saved : DEFAULT_ENGINE;
};
const currentCustom = () => read(CUSTOM_KEY) ?? '';

/**
 * Optional web search from the palette, saved in this browser only (never sent to the server).
 * Off by default. `template` is null when search is off or the chosen engine is not usable.
 */
export function useWebSearchPreferences() {
  const enabled = useSyncExternalStore(subscribe, currentEnabled, () => false);
  const engine = useSyncExternalStore(subscribe, currentEngine, () => DEFAULT_ENGINE);
  const customUrl = useSyncExternalStore(subscribe, currentCustom, () => '');
  const setEnabled = useCallback((next: boolean) => write(ENABLED_KEY, next ? 'on' : 'off'), []);
  const setEngine = useCallback((next: EngineChoice) => write(ENGINE_KEY, next), []);
  /** Saves a valid template (or an empty one) and returns why a rejected one was not saved. */
  const setCustomUrl = useCallback((next: string) => {
    const problem = next ? templateProblem(next) : null;
    if (!problem) write(CUSTOM_KEY, next);
    return problem;
  }, []);
  const template = enabled ? engineTemplate(engine, customUrl) : null;
  return { enabled, setEnabled, engine, setEngine, customUrl, setCustomUrl, template };
}
