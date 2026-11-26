import { expect, it, vi } from 'vitest';
import { createHealthchecksRegistration } from './registration.js';
import type { IntegrationTransport } from '../../backend.js';

it('reads and projects bounded checks without leaking API fields', async () => {
  const transport: IntegrationTransport = vi.fn(async () => ({
    status: 200,
    body: {
      checks: [
        { name: 'Normal', status: 'up', last_ping: null, ping_url: 'secret-url' },
        {
          name: 'Backup',
          status: 'down',
          last_ping: '2026-01-01T00:00:00Z',
          unique_key: 'secret-id',
        },
        { name: 'Unexpected', status: 'future', last_ping: null },
      ],
    },
  }));
  const query = createHealthchecksRegistration((code) => new Error(code)).prepareWidgetQuery({
    publicConfig: { url: 'https://hc.example.test' },
    credentials: { secret: 'synthetic-secret' },
    transport,
  });
  const result = await query('job-checks', {});
  expect(result).toEqual({
    checks: [
      { name: 'Backup', status: 'down', lastPing: '2026-01-01T00:00:00Z' },
      { name: 'Unexpected', status: 'unknown', lastPing: null },
      { name: 'Normal', status: 'up', lastPing: null },
    ],
    total: 3,
    fetchedAt: expect.any(Number),
    stale: false,
  });
  expect(transport).toHaveBeenCalledWith({
    origin: 'https://hc.example.test',
    path: '/api/v3/checks/',
    apiKey: 'synthetic-secret',
    maxBodyBytes: 1_000_000,
  });
  expect(JSON.stringify(result)).not.toMatch(/secret/);
  await expect(query('other', {})).rejects.toThrow();
  await expect(query('job-checks', { extra: true })).rejects.toThrow();
});

it('rejects unavailable and malformed results and bounds returned rows', async () => {
  let body: unknown = {
    checks: Array.from({ length: 60 }, (_, i) => ({
      name: String(i),
      status: 'up',
      last_ping: null,
    })),
  };
  const transport: IntegrationTransport = vi.fn(async () => ({ status: 200, body }));
  const query = createHealthchecksRegistration((code) => new Error(code)).prepareWidgetQuery({
    publicConfig: { url: 'https://hc.example.test' },
    credentials: { secret: 'synthetic-secret' },
    transport,
  });
  expect(await query('job-checks', {})).toMatchObject({
    checks: expect.arrayContaining([{ name: '0', status: 'up', lastPing: null }]),
    total: 60,
  });
  expect(((await query('job-checks', {})) as { checks: unknown[] }).checks).toHaveLength(50);
  body = { checks: [{ name: 'bad', status: 'up', last_ping: 'bad' }] };
  await expect(query('job-checks', {})).rejects.toThrow();
  body = { checks: Array.from({ length: 10001 }, () => ({})) };
  await expect(query('job-checks', {})).rejects.toThrow();
});

it('rejects invalid credentials and preserves all documented statuses', async () => {
  let status = 401;
  const transport: IntegrationTransport = vi.fn(async () => ({
    status,
    body: {
      checks: ['up', 'grace', 'down', 'paused', 'new'].map((state) => ({
        name: state,
        status: state,
        last_ping: null,
      })),
    },
  }));
  const query = createHealthchecksRegistration((code) => new Error(code)).prepareWidgetQuery({
    publicConfig: { url: 'https://hc.example.test' },
    credentials: { secret: 'synthetic-secret' },
    transport,
  });
  await expect(query('job-checks', {})).rejects.toThrow();
  status = 200;
  expect(
    ((await query('job-checks', {})) as { checks: { status: string }[] }).checks.map(
      (check) => check.status,
    ),
  ).toEqual(['down', 'grace', 'new', 'paused', 'up']);
});

it('preserves a configured base path', async () => {
  const transport: IntegrationTransport = vi.fn(async () => ({
    status: 200,
    body: { checks: [] },
  }));
  const query = createHealthchecksRegistration((code) => new Error(code)).prepareWidgetQuery({
    publicConfig: { url: 'https://hc.example.test/monitor' },
    credentials: { secret: 'synthetic-secret' },
    transport,
  });
  await query('job-checks', {});
  expect(transport).toHaveBeenCalledWith(
    expect.objectContaining({ origin: 'https://hc.example.test', path: '/monitor/api/v3/checks/' }),
  );
});
