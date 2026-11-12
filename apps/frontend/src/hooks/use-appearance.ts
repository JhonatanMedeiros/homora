import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
  type ContrastProblem,
} from '@homora/shared';
import { applyAppearance } from '@/lib/appearance';
import { apiError } from '@/i18n/api-errors';

type State = { appearance: Appearance; loaded: boolean; failed: boolean };
let state: State = { appearance: DEFAULT_APPEARANCE, loaded: false, failed: false };
let loading = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getState = () => state;

function publish(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.appearance) applyAppearance(state.appearance);
  listeners.forEach((listener) => listener());
}

async function load() {
  if (loading || state.loaded) return;
  loading = true;
  try {
    const response = await fetch('/api/appearance');
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { appearance?: unknown };
    const parsed = parseAppearance(body.appearance);
    if (!parsed) throw new Error();
    publish({ appearance: parsed, loaded: true, failed: false });
  } catch {
    // Keep the default look; the page stays usable.
    publish({ loaded: true, failed: true });
  } finally {
    loading = false;
  }
}

export type SaveResult =
  { ok: true } | { ok: false; message: string; problems?: ContrastProblem[] };

async function send(init: RequestInit): Promise<SaveResult> {
  try {
    const response = await fetch('/api/appearance', {
      ...init,
      // A JSON content type with no body is rejected by the server.
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = (await response.json().catch(() => null)) as {
      appearance?: unknown;
      problems?: ContrastProblem[];
    } | null;
    if (!response.ok)
      return {
        ok: false,
        message: apiError(body, ''),
        problems: Array.isArray(body?.problems) ? body.problems : undefined,
      };
    const parsed = parseAppearance(body?.appearance);
    if (!parsed) return { ok: false, message: '' };
    publish({ appearance: parsed, failed: false });
    return { ok: true };
  } catch {
    return { ok: false, message: '' };
  }
}

/** Test helper: forgets everything so each test starts from the default look. */
export function resetAppearanceStore() {
  state = { appearance: DEFAULT_APPEARANCE, loaded: false, failed: false };
  loading = false;
  applyAppearance(DEFAULT_APPEARANCE);
}

/**
 * The instance appearance. It lives on the server so every device shows the same look; it is
 * fetched once per page load and applied to the document root as soon as it arrives.
 */
export function useAppearance() {
  const current = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    void load();
  }, []);
  const save = useCallback(
    (appearance: Appearance) => send({ method: 'PUT', body: JSON.stringify(appearance) }),
    [],
  );
  const reset = useCallback(() => send({ method: 'DELETE' }), []);
  return { ...current, save, reset };
}
