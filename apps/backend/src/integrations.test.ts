import { expect, it, vi } from 'vitest';
import { defineBackendIntegration } from '@homora/integrations/backend';
import { jellyfinManifest } from '@homora/shared';
import { createIntegrationRegistry, createObservationCache } from './integrations.js';

const proxmoxAdapter = { type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] };

it('derives metadata from the definition and delegates reads to the supplied hooks', async () => {
  const collect = vi.fn(async () => ({ name: 'example' }));
  const prepare = vi.fn(() => collect);
  const entry = defineBackendIntegration(jellyfinManifest, { prepare });
  const registry = createIntegrationRegistry([entry]);
  const context = { publicConfig: { url: 'https://example.test' }, credentials: {} };
  expect(registry.list()[0]).toEqual({
    type: jellyfinManifest.type,
    label: jellyfinManifest.label,
    capabilities: jellyfinManifest.capabilities,
  });
  expect(await registry.prepare(jellyfinManifest.type, context)()).toEqual({ name: 'example' });
  expect(prepare).toHaveBeenCalledWith(context);
  expect(() => registry.prepareInventory(jellyfinManifest.type, context)).toThrow();
});

it('exposes metadata without disclosing implementation or configs and rejects duplicates', () => {
  const registry = createIntegrationRegistry([proxmoxAdapter]);
  const list = registry.list();
  expect(list).toEqual([{ type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] }]);
  list[0].capabilities.push('changed');
  expect(registry.list()[0].capabilities).toEqual(['inventory']);
  expect(() => createIntegrationRegistry([proxmoxAdapter, proxmoxAdapter])).toThrow('Duplicate');
});

it('shares collection, respects TTL and allows forced refresh', async () => {
  let time = 0;
  const cache = createObservationCache<number>(1000, () => time);
  const fetch = vi.fn(async () => 42);
  expect(await Promise.all([cache.collect(fetch), cache.collect(fetch)])).toEqual([
    { data: 42, checkedAt: new Date(0).toISOString() },
    { data: 42, checkedAt: new Date(0).toISOString() },
  ]);
  await cache.collect(fetch);
  expect(fetch).toHaveBeenCalledTimes(1);
  await cache.collect(fetch, true);
  expect(fetch).toHaveBeenCalledTimes(2);
  time = 1000;
  await cache.collect(fetch);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('does not store failures nor return stale response after concurrent invalidation', async () => {
  const cache = createObservationCache<number>(1000);
  const fail = vi.fn(async () => {
    throw new Error('failure');
  });
  await expect(cache.collect(fail)).rejects.toThrow('failure');
  await expect(cache.collect(fail)).rejects.toThrow('failure');
  expect(fail).toHaveBeenCalledTimes(2);
  let finish!: (value: number) => void;
  const old = cache.collect(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  cache.invalidate();
  expect((await cache.collect(async () => 2)).data).toBe(2);
  finish(1);
  await expect(old).rejects.toMatchObject({ code: 'integration-changed' });
  expect((await cache.collect(async () => 3)).data).toBe(2);
});

it('discards previous value when forced refresh fails', async () => {
  const cache = createObservationCache<number>(1000);
  await cache.collect(async () => 1);
  await expect(
    cache.collect(async () => {
      throw new Error('unavailable');
    }, true),
  ).rejects.toThrow('unavailable');
  expect((await cache.collect(async () => 2)).data).toBe(2);
});
