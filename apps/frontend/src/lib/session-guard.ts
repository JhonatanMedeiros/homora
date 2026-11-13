const pathOf = (input: RequestInfo | URL) => {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, window.location.origin).pathname;
  } catch {
    return '';
  }
};

/** API routes that need a session. `/api/auth/*` answers 401 for a wrong password, which is not an expiry. */
const needsSession = (path: string) => path.startsWith('/api/') && !path.startsWith('/api/auth/');

/**
 * Calls `onExpired` when the server answers 401 to a request that needs a session, for example
 * after the session ended on the server or from another device. Returns a function that stops it.
 */
export function watchSession(onExpired: () => void): () => void {
  const original = globalThis.fetch;
  const guarded: typeof fetch = async (input, init) => {
    const response = await original(input, init);
    if (response?.status === 401 && needsSession(pathOf(input))) onExpired();
    return response;
  };
  globalThis.fetch = guarded;
  return () => {
    if (globalThis.fetch === guarded) globalThis.fetch = original;
  };
}
