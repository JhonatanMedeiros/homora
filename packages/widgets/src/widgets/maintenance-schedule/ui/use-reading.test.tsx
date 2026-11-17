// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMaintenanceReading } from './use-reading.js';
const query = { days: 7 as const, limit: 5, pages: [], groups: [] };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('refreshes at transitions, retains data on failure, and isolates changes of scope', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  const data = {
    generatedAt: Date.now(),
    total: 1,
    items: [
      {
        id: 1,
        monitorId: 1,
        name: 'A',
        startsAt: Date.now() + 1000,
        endsAt: Date.now() + 2000,
        hasService: true,
      },
    ],
  };
  const read = vi.fn().mockResolvedValueOnce(data).mockRejectedValue(new Error('offline'));
  const result = renderHook(({ value }) => useMaintenanceReading(value, read), {
    initialProps: { value: query },
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.result.current).toMatchObject({ status: 'ready', stale: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(result.result.current).toMatchObject({ status: 'ready', stale: true, data });
  result.rerender({ value: { ...query, groups: ['missing'] } });
  expect(result.result.current.status).toBe('loading');
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.result.current.status).toBe('error');
});

it('refreshes through scheduled, active, and ended boundaries', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  const start = Date.now() + 1000;
  const end = start + 2000;
  const item = { id: 1, monitorId: 1, name: 'A', startsAt: start, endsAt: end, hasService: true };
  const read = vi.fn(async () => ({
    generatedAt: Date.now(),
    total: Date.now() < end ? 1 : 0,
    items: Date.now() < end ? [item] : [],
  }));
  const result = renderHook(() => useMaintenanceReading(query, read));
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.result.current).toMatchObject({
    status: 'ready',
    data: { generatedAt: start - 1000, total: 1 },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(result.result.current).toMatchObject({
    status: 'ready',
    data: { generatedAt: start, total: 1 },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(result.result.current).toMatchObject({
    status: 'ready',
    data: { generatedAt: end, total: 0 },
  });
});
