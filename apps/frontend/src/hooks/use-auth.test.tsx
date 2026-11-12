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
