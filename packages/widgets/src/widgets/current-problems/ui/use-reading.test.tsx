// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useProblemsReading } from './use-reading.js';

const query = { limit: 5, pages: [], groups: [], includeDegraded: true };
const data = {
  generatedAt: 1_700_000_000_000,
  items: [],
  total: 0,
  unmeasured: 0,
  truncated: false,
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('keeps a failed refresh stale while another instance has its own error', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(data.generatedAt);
  const read = vi.fn().mockResolvedValueOnce(data).mockRejectedValue(new Error('offline'));
  const first = renderHook(() => useProblemsReading(query, read));
  const second = renderHook(() => useProblemsReading({ ...query, limit: 2 }, read));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(first.result.current.status).toBe('ready');
  expect(second.result.current.status).toBe('error');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(first.result.current).toMatchObject({ status: 'ready', stale: true, data });
});
