import { expect, it, vi } from 'vitest';
import {
  adguardManifest,
  homeAssistantManifest,
  jellyfinManifest,
  uptimeKumaManifest,
  type IntegrationManifest,
} from '@homora/shared';
import { createManifestAdapter } from './manifest-adapter.js';
import type { IntegrationTransport } from './integrations.js';

/**
 * These expectations were captured from the hand-written adapters (jellyfin.ts, uptime-kuma.ts,
 * home-assistant.ts, adguard.ts) over the same inputs before those files were removed: a
 * differential run over URL, slug, entity, credential and response variants showed identical
 * accept/reject decisions, requests and data. They now pin that behaviour.
 */
async function collect(
  manifest: IntegrationManifest,
  config: Record<string, string>,
  body: unknown,
) {
  const transport = vi.fn<IntegrationTransport>(async () => ({ status: 200, body }));
  const data = await createManifestAdapter(manifest, transport).collect(config);
  return { data, calls: transport.mock.calls.map(([request]) => request) };
}

it('jellyfin keeps its request and data, including a reverse-proxy path prefix', async () => {
  const result = await collect(
    jellyfinManifest,
    { url: 'http://example.test/jellyfin/' },
    { ServerName: 'Server', Version: '10.10', Id: 'private' },
  );
  expect(result.data).toEqual({ name: 'Server', version: '10.10' });
  expect(result.calls).toEqual([
    { origin: 'http://example.test', path: '/jellyfin/System/Info/Public' },
  ]);
});

it('uptime-kuma keeps its request and tally', async () => {
  const result = await collect(
    uptimeKumaManifest,
    { url: 'https://kuma.example', slug: 'home' },
    {
      heartbeatList: {
        a: [{ status: 0 }, { status: 1 }],
        b: [{ status: 0 }],
        c: [{ status: 2 }],
        d: [{ status: 3 }],
        e: [],
        f: [{ status: 9 }],
      },
    },
  );
  expect(result.data).toEqual({ up: 1, down: 1, pending: 1, maintenance: 1, unknown: 2 });
  expect(result.calls).toEqual([
    { origin: 'https://kuma.example', path: '/api/status-page/heartbeat/home' },
  ]);
});

it('home-assistant keeps bearer auth, the entity path and the entity check', async () => {
  const config = { url: 'https://ha.example', entityId: 'sensor.a', secret: 'tok' };
  const ok = await collect(homeAssistantManifest, config, {
    entity_id: 'sensor.a',
    state: 'on',
    last_updated: '2026-01-01',
  });
  expect(ok.data).toEqual({ entityId: 'sensor.a', state: 'on', lastUpdated: '2026-01-01' });
  expect(ok.calls).toEqual([
    { origin: 'https://ha.example', path: '/api/states/sensor.a', authorization: 'Bearer tok' },
  ]);
  expect(
    (await collect(homeAssistantManifest, config, { entity_id: 'sensor.a', state: 'on' })).data,
  ).toEqual({ entityId: 'sensor.a', state: 'on', lastUpdated: null });
  await expect(
    collect(homeAssistantManifest, config, { entity_id: 'sensor.b', state: 'on' }),
  ).rejects.toThrow('Invalid response');
  await expect(
    collect(homeAssistantManifest, config, { entity_id: 'sensor.a', state: 'tok' }),
  ).rejects.toThrow('Invalid response');
});

it('adguard-home keeps basic auth and renames protection_enabled', async () => {
  const result = await collect(
    adguardManifest,
    { url: 'https://dns.example', username: 'admin', secret: 'pw' },
    { running: true, protection_enabled: false, version: 'v1' },
  );
  expect(result.data).toEqual({ running: true, protectionEnabled: false, version: 'v1' });
  expect(result.calls).toEqual([
    {
      origin: 'https://dns.example',
      path: '/control/status',
      authorization: `Basic ${Buffer.from('admin:pw').toString('base64')}`,
    },
  ]);
  await expect(
    collect(
      adguardManifest,
      { url: 'https://dns.example', username: 'admin', secret: 'pw' },
      { running: true, protection_enabled: true, version: 'has-pw-inside' },
    ),
  ).rejects.toThrow('Invalid response');
});

it('keeps the specific messages for not found and refused access', async () => {
  const status = (code: number) =>
    createManifestAdapter(uptimeKumaManifest, async () => ({ status: code, body: null }));
  await expect(status(404).collect({ url: 'https://k.example', slug: 'a' })).rejects.toThrow(
    'Status page not found',
  );
  const ha = createManifestAdapter(homeAssistantManifest, async () => ({
    status: 401,
    body: null,
  }));
  await expect(
    ha.collect({ url: 'https://h.example', entityId: 'sensor.a', secret: 't' }),
  ).rejects.toThrow('refused authentication');
});

it('sends the secret only through the whitelisted header each auth type names', async () => {
  const run = async (auth: IntegrationManifest['auth'], secret: string) => {
    const manifest = {
      ...jellyfinManifest,
      auth,
      fields: [
        ...jellyfinManifest.fields,
        { key: 'secret', kind: 'secret', label: 'S', required: true, maxLength: 50 } as const,
      ],
    };
    return (
      await collect(manifest, { url: 'https://x.test', secret }, { ServerName: 'a', Version: '1' })
    ).calls[0];
  };
  expect(await run({ type: 'token' }, 'abc')).toMatchObject({ authorization: 'Token abc' });
  expect(await run({ type: 'api-key' }, 'abc')).toMatchObject({ apiKey: 'abc' });
  expect(await run({ type: 'api-key' }, 'abc')).not.toHaveProperty('authorization');
  expect(await run({ type: 'basic-key' }, 'abc')).toMatchObject({
    authorization: `Basic ${Buffer.from('abc:').toString('base64')}`,
  });
});
