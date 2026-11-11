import { expect, it, vi } from 'vitest';
import { createUptimeKumaAdapter } from './uptime-kuma.js';
const config = { url: 'https://kuma.example', slug: 'home' };
it('summarizes the latest status of public pages without exposing monitor details', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: {
      heartbeatList: {
        a: [{ status: 0 }, { status: 1 }],
        b: [{ status: 0 }],
        c: [{ status: 2 }],
        d: [{ status: 3 }],
        e: [],
      },
    },
  }));
  expect(await createUptimeKumaAdapter(transport).collect(config)).toEqual({
    up: 1,
    down: 1,
    pending: 1,
    maintenance: 1,
    unknown: 1,
  });
  expect(transport).toHaveBeenCalledWith({
    origin: config.url,
    path: '/api/status-page/heartbeat/home',
  });
});
it('rejects malformed slug or origin before reaching the network', async () => {
  const transport = vi.fn();
  const adapter = createUptimeKumaAdapter(transport);
  for (const changed of [
    { slug: '../secret' },
    { url: 'https://user:pass@kuma.example' },
    { url: 'file:///etc' },
  ])
    await expect(adapter.collect({ ...config, ...changed })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it('fails on missing page or malformed response', async () => {
  await expect(
    createUptimeKumaAdapter(async () => ({ status: 404, body: null })).collect(config),
  ).rejects.toThrow('not found');
  await expect(
    createUptimeKumaAdapter(async () => ({ status: 200, body: { heartbeatList: [] } })).collect(
      config,
    ),
  ).rejects.toThrow('Invalid response');
});
