// @vitest-environment happy-dom
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuth } from './use-auth';

afterEach(() => vi.unstubAllGlobals());

it('allows retrying the initial connection after a failure', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ configured: true, authenticated: false }),
    });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.error).not.toBe(''));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status?.configured).toBe(true));
  expect(result.current.error).toBe('');
});

it('returns to sign in with an expired flag when an API call answers 401', async () => {
  const original = globalThis.fetch;
  const stub = vi.fn(async (url: string) =>
    url === '/api/auth/status'
      ? new Response(JSON.stringify({ configured: true, authenticated: true }))
      : new Response('{}', { status: 401 }),
  );
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status?.authenticated).toBe(true));
    expect(result.current.expired).toBe(false);
    await act(async () => {
      await fetch('/api/services');
    });
    await waitFor(() => expect(result.current.status?.authenticated).toBe(false));
    expect(result.current.expired).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

it('checks the session again when the tab becomes visible', async () => {
  const original = globalThis.fetch;
  let authenticated = true;
  const stub = vi.fn(async () => new Response(JSON.stringify({ configured: true, authenticated })));
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status?.authenticated).toBe(true));
    authenticated = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.expired).toBe(true));
  } finally {
    globalThis.fetch = original;
  }
});
