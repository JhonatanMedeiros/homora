import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { CUSTOM_CSS_PATH, type CustomCssProblem } from '@homora/shared';
import { apiError } from '@/i18n/api-errors';

export type CustomCssState = {
  css: string;
  enabled: boolean;
  bytes: number;
  version: string;
  loaded: boolean;
  failed: boolean;
};

const SAFE_KEY = 'homora-safe-css';
const LINK_ID = 'homora-custom-css';

/**
 * Safe mode: `?safe=1` on any address loads Homora without custom CSS in this tab. It is kept
 * for the tab (session storage) because the address query is lost when the app navigates.
 */
function readSafe(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('safe') === '1') {
      sessionStorage.setItem(SAFE_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(SAFE_KEY) === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('safe') === '1';
  }
}

let safe = readSafe();
let state: CustomCssState = {
  css: '',
  enabled: false,
  bytes: 0,
  version: '',
  loaded: false,
  failed: false,
};
let loading = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => ({ ...state, safe });
let cached = snapshot();
const getSnapshot = () => cached;

/** Adds or removes the same-origin stylesheet link; it is the only way the CSS reaches the page. */
function syncLink() {
  const existing = document.getElementById(LINK_ID);
  if (!state.enabled || safe) {
    existing?.remove();
    return;
  }
  const href = `${CUSTOM_CSS_PATH}?v=${state.version}`;
  if (existing instanceof HTMLLinkElement) {
    if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.setAttribute('href', href);
  // Last in <head>, so it wins over the application's own rules of equal weight.
  document.head.appendChild(link);
}

function publish(next: Partial<CustomCssState>) {
  state = { ...state, ...next };
  cached = snapshot();
  syncLink();
  listeners.forEach((listener) => listener());
}

const parse = (body: unknown): Partial<CustomCssState> | null => {
  if (typeof body !== 'object' || body === null) return null;
  const { css, enabled, bytes, version } = body as Record<string, unknown>;
  if (
    typeof css !== 'string' ||
    typeof enabled !== 'boolean' ||
    typeof bytes !== 'number' ||
    typeof version !== 'string'
  )
    return null;
  return { css, enabled, bytes, version };
};

async function load() {
  if (loading || state.loaded) return;
  loading = true;
  try {
    const response = await fetch('/api/appearance/custom-css');
    const parsed = response.ok ? parse(await response.json()) : null;
    if (!parsed) throw new Error();
    publish({ ...parsed, loaded: true, failed: false });
  } catch {
    publish({ loaded: true, failed: true });
  } finally {
    loading = false;
  }
}

export type CustomCssResult =
  { ok: true } | { ok: false; message: string; problem?: CustomCssProblem };

async function send(payload: { css?: string; enabled?: boolean }): Promise<CustomCssResult> {
  try {
    const response = await fetch('/api/appearance/custom-css', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok)
      return {
        ok: false,
        message: apiError(body, ''),
        problem:
          typeof body === 'object' && body !== null && 'problem' in body
            ? ((body as { problem: CustomCssProblem }).problem ?? undefined)
            : undefined,
      };
    const parsed = parse(body);
    if (!parsed) return { ok: false, message: '' };
    publish({ ...parsed, failed: false });
    return { ok: true };
  } catch {
    return { ok: false, message: '' };
  }
}

/** Leaves safe mode for this tab: the stylesheet is loaded again, if it is on. */
export function leaveSafeMode() {
  try {
    sessionStorage.removeItem(SAFE_KEY);
  } catch {
    /* Nothing was stored. */
  }
  safe = false;
  const url = new URL(window.location.href);
  if (url.searchParams.has('safe')) {
    url.searchParams.delete('safe');
    window.history.replaceState(window.history.state, '', url);
  }
  publish({});
}

/** Test helper. */
export function resetCustomCssStore(options: { safe?: boolean } = {}) {
  try {
    sessionStorage.removeItem(SAFE_KEY);
  } catch {
    /* Nothing to clear. */
  }
  safe = options.safe ?? false;
  state = { css: '', enabled: false, bytes: 0, version: '', loaded: false, failed: false };
  loading = false;
  cached = snapshot();
  syncLink();
}

/**
 * The instance custom CSS. It is only loaded after sign-in, so the sign-in page can never be
 * broken by it, and not at all in safe mode.
 */
export function useCustomCss() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void load();
  }, []);
  const saveCss = useCallback((css: string) => send({ css }), []);
  const setEnabled = useCallback((enabled: boolean) => send({ enabled }), []);
  return { ...current, saveCss, setEnabled, leaveSafeMode };
}
