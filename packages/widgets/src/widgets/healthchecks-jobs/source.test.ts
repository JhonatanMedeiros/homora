import { expect, it, vi } from 'vitest';
import { healthchecksJobsSource } from './source.js';

it('restricts and tags connection queries and projects the returned fields', async () => {
  expect(healthchecksJobsSource.parseQuery({ connectionId: '0' })).toBeNull();
  expect(healthchecksJobsSource.parseQuery({ connectionId: '1', other: 'x' })).toBeNull();
  const query = healthchecksJobsSource.parseQuery({ connectionId: '4' })!;
  expect(query.cacheTags).toEqual(['integration:4']);
  const readIntegration = vi.fn(async () => ({
    checks: [{ name: 'Job', status: 'down', lastPing: null, secret: 'private' }],
    total: 1,
    fetchedAt: 123,
    stale: false,
    secret: 'private',
  }));
  const result = await healthchecksJobsSource.read(query.params, {
    fetch: vi.fn(),
    now: () => 123,
    readIntegration,
  });
  expect(readIntegration).toHaveBeenCalledWith(4, 'job-checks', {});
  expect(result).toEqual({
    checks: [{ name: 'Job', status: 'down', lastPing: null }],
    total: 1,
    fetchedAt: 123,
    stale: false,
  });
});

it('rejects malformed data rather than showing it as a successful reading', async () => {
  const query = healthchecksJobsSource.parseQuery({ connectionId: '4' })!;
  for (const data of [
    null,
    { checks: [], total: 1, fetchedAt: NaN, stale: false },
    {
      checks: [{ name: 'Job', status: 'up', lastPing: 'bad' }],
      total: 1,
      fetchedAt: 10,
      stale: false,
    },
  ]) {
    await expect(
      healthchecksJobsSource.read(query.params, {
        fetch: vi.fn(),
        now: () => 123,
        readIntegration: vi.fn(async () => data),
      }),
    ).rejects.toThrow();
  }
});
