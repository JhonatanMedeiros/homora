import { expect, it } from 'vitest';
import { createManifestAdapter, fixture } from '../../../test-support/integration-test-support.js';
import { uptimeKumaManifest } from './definition.js';

const collect = (page: unknown, heartbeat: unknown = fixture('uptime-kuma/heartbeat.json')) =>
  createManifestAdapter(uptimeKumaManifest, async (request) => ({
    status: 200,
    body: request.path.includes('/heartbeat/') ? heartbeat : page,
  })).collect({ url: 'https://kuma.example.test', slug: 'home' });

it('joins published monitors by id, deduplicates and leaves missing heartbeats unknown', async () => {
  const data = await collect({
    publicGroupList: [
      { name: 'Empty', monitorList: [] },
      {
        name: 'First',
        monitorList: [
          { id: 1, name: '<b>External</b>' },
          { id: 42, name: 'New' },
        ],
      },
      { name: 'Second', monitorList: [{ id: 1, name: 'Duplicate' }] },
    ],
  });
  expect(data).toEqual({
    up: 1,
    down: 1,
    pending: 1,
    maintenance: 1,
    unknown: 1,
    monitors: [
      { id: 1, name: '<b>External</b>', group: 'First', status: 'up' },
      { id: 42, name: 'New', group: 'First', status: 'unknown' },
    ],
  });
});

it('enforces the limit after deduplication and rejects malformed external data', async () => {
  const monitors = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `Monitor ${i}` }));
  const page = (items: unknown[]) => ({ publicGroupList: [{ name: 'Group', monitorList: items }] });
  expect((await collect(page(monitors))).monitors).toHaveLength(50);
  await expect(collect(page([...monitors, { id: 51, name: 'Extra' }]))).rejects.toMatchObject({
    name: 'IntegrationRowsLimitError',
  });
  await expect(collect(page([{ id: 1, name: 'x'.repeat(257) }]))).rejects.toThrow(
    'Invalid response',
  );
  await expect(
    collect(page([{ id: 1, name: 'OK' }]), { heartbeatList: { 1: 'bad' } }),
  ).rejects.toThrow('Invalid response');
});
