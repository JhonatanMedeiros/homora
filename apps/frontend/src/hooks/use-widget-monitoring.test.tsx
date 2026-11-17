// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useWidgetMonitoring } from './use-widget-monitoring';

const query = { days: 7, limit: 5, minimumMinutes: 0, groups: [], pages: [] };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('keeps the last result stale after a failed refresh and isolates another instance', async () => {
  vi.useFakeTimers();
  const data = { generatedAt: Date.now(), periodDays: 7, items: [], truncated: false };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    .mockResolvedValueOnce(new Response('', { status: 500 }))
    .mockResolvedValue(new Response('', { status: 500 }));
  vi.stubGlobal('fetch', fetcher);
  const first = renderHook(() => useWidgetMonitoring(query));
  await act(async () => {});
  expect(first.result.current.status).toBe('ready');
  const second = renderHook(() => useWidgetMonitoring({ ...query, days: 1 }));
  await act(async () => {});
  expect(second.result.current.status).toBe('error');
  expect(first.result.current).toMatchObject({ status: 'ready', stale: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(first.result.current).toMatchObject({ status: 'ready', stale: true, data });
});
