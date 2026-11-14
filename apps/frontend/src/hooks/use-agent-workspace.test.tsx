// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAgentWorkspace } from './use-agent-workspace';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('loads proposals created while the agents page is open', async () => {
  let proposals: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/proposals'
          ? proposals
          : url === '/api/proposal-settings'
            ? { ttlMinutes: 15 }
            : [],
    })),
  );
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.useFakeTimers();
  const { result } = renderHook(() =>
    useAgentWorkspace(
      () => {},
      () => {},
    ),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.proposals).toEqual([]);
  proposals = [
    { id: 'p1', state: 'pending', expiresAt: Date.now() + 60000, createdAt: Date.now() },
  ];
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(result.current.pending.map((proposal) => proposal.id)).toEqual(['p1']);
});
