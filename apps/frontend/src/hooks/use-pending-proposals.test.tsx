// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePendingProposals, useProposals } from './use-pending-proposals';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('updates both badges and the review list from one snapshot, including expiration', async () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let data: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => data })),
  );
  const { result } = renderHook(() => ({
    bell: usePendingProposals('bell', true),
    navigation: usePendingProposals('agents', true),
    proposals: useProposals(),
  }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  data = [{ id: 'p1', state: 'pending', expiresAt: Date.now() + 20_000 }];
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(result.current.bell).toBe(1);
  expect(result.current.navigation).toBe(1);
  expect(result.current.proposals?.map((proposal) => proposal.id)).toEqual(['p1']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(result.current.bell).toBe(0);
  expect(result.current.navigation).toBe(0);
});
