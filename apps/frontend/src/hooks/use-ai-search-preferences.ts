import { useCallback, useSyncExternalStore } from 'react';

export const AI_DESTINATIONS = [
  { id: 'chatgpt', label: 'ChatGPT', template: 'https://chatgpt.com/?q=%s' },
  { id: 'claude', label: 'Claude', template: 'https://claude.ai/new?q=%s' },
  { id: 'v0', label: 'v0', template: 'https://v0.dev/?q=%s' },
  { id: 'scira', label: 'Scira', template: 'https://scira.ai/?q=%s' },
] as const;
export type AiDestination = (typeof AI_DESTINATIONS)[number]['id'];
export const isAiDestination = (value: string): value is AiDestination =>
  AI_DESTINATIONS.some((item) => item.id === value);

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be unavailable. */
  }
  listeners.forEach((listener) => listener());
};
const enabledSnapshot = () => read('homora-ai-search') === 'on';
const destinationSnapshot = (): AiDestination => {
  const value = read('homora-ai-search-destination');
  return value && isAiDestination(value) ? value : 'chatgpt';
};

export function useAiSearchPreferences() {
  const enabled = useSyncExternalStore(subscribe, enabledSnapshot, () => false);
  const destination = useSyncExternalStore(
    subscribe,
    destinationSnapshot,
    () => 'chatgpt' as const,
  );
  const setEnabled = useCallback(
    (next: boolean) => write('homora-ai-search', next ? 'on' : 'off'),
    [],
  );
  const setDestination = useCallback(
    (next: AiDestination) => write('homora-ai-search-destination', next),
    [],
  );
  return { enabled, destination, setEnabled, setDestination };
}
