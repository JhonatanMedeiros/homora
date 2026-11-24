import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });

// Test files share their module graph, DOM and globals (`isolate: false` in vitest.config.ts), so
// each file must leave the worker as it found it. Everything a test file can change and that
// outlives it is reset in `afterAll`; AGENTS.md lists the rules for new tests.

// UI tests assert Portuguese strings; the app's default is detected from the browser.
setLocale('pt-BR');
const environment = { ...process.env };

type Snapshot = { target: object; original: Map<PropertyKey, PropertyDescriptor>; strict: boolean };
const internal = (key: PropertyKey) =>
  typeof key === 'string' && /^(__vitest|\$\$|__vite)/.test(key);

/**
 * Records the own properties of an object a test can patch, to put them back afterwards. `strict`
 * also removes properties the tests added; it is off for `globalThis`, where the runtime itself
 * adds properties lazily, so only properties that existed and changed (such as `innerWidth`) return.
 */
function capture(target: unknown, strict: boolean): Snapshot[] {
  if ((typeof target !== 'object' && typeof target !== 'function') || target === null) return [];
  // Symbol keys are the DOM implementation's own bookkeeping, not something a test replaces.
  const original = new Map(Object.entries(Object.getOwnPropertyDescriptors(target)));
  return [{ target, original, strict }];
}

function restore(snapshots: Snapshot[]) {
  for (const { target, original, strict } of snapshots) {
    if (strict) {
      for (const key of Object.getOwnPropertyNames(target)) {
        if (!original.has(key) && !internal(key)) Reflect.deleteProperty(target, key);
      }
    }
    for (const [key, descriptor] of original) {
      const current = Object.getOwnPropertyDescriptor(target, key);
      if (internal(key) || !current) continue;
      const same =
        current.value === descriptor.value &&
        current.get === descriptor.get &&
        current.set === descriptor.set;
      if (same) continue;
      try {
        Object.defineProperty(target, key, descriptor);
      } catch {
        // A non-configurable property cannot have been replaced by a test.
      }
    }
  }
}

const hasDom = typeof document !== 'undefined';
let unexpectedFetches: string[] = [];
beforeEach(() => {
  if (!hasDom) return;
  unexpectedFetches = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    unexpectedFetches.push(String(input));
    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
  });
});
afterEach(() => {
  if (unexpectedFetches.length > 0)
    throw new Error(`Unexpected fetches: ${unexpectedFetches.join(', ')}`);
});
// Assigning `window.innerWidth` does not change the property descriptor, so the viewport is put
// back by value.
const viewportKeys = ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight'] as const;
const viewport = hasDom ? viewportKeys.map((key) => [key, window[key]] as const) : [];

const baseline = [
  ...capture(globalThis, false),
  ...capture(hasDom && document, true),
  ...capture(hasDom && navigator, true),
  ...capture(hasDom && Element.prototype, true),
  ...capture(hasDom && HTMLElement.prototype, true),
];

afterAll(async () => {
  vi.useRealTimers();
  // Application modules are evaluated again by the next file; dependencies stay loaded.
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();

  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);

  if (hasDom) {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  }
  restore(baseline);
  for (const [key, value] of viewport) {
    window[key] = value;
    if (window[key] !== value) {
      Object.defineProperty(window, key, { value, configurable: true, writable: true });
    }
  }
  setLocale('pt-BR');
});
