import { expect, it, vi } from 'vitest';
import {
  createIntegrationRegistry,
  createObservationCache,
  proxmoxAdapter,
} from './integrations.js';

it('expõe metadados sem expor implementação nem configurações e rejeita duplicatas', () => {
  const registry = createIntegrationRegistry([proxmoxAdapter]);
  const list = registry.list();
  expect(list).toEqual([{ type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] }]);
  list[0].capabilities.push('alterado');
  expect(registry.list()[0].capabilities).toEqual(['inventory']);
  expect(() => createIntegrationRegistry([proxmoxAdapter, proxmoxAdapter])).toThrow('duplicado');
});

it('compartilha coleta, respeita TTL e permite atualização forçada', async () => {
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

it('não guarda falhas nem retorna resposta antiga após invalidação concorrente', async () => {
  const cache = createObservationCache<number>(1000);
  const fail = vi.fn(async () => {
    throw new Error('falha');
  });
  await expect(cache.collect(fail)).rejects.toThrow('falha');
  await expect(cache.collect(fail)).rejects.toThrow('falha');
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
  await expect(old).rejects.toThrow('configuração mudou');
  expect((await cache.collect(async () => 3)).data).toBe(2);
});

it('descarta valor anterior quando atualização forçada falha', async () => {
  const cache = createObservationCache<number>(1000);
  await cache.collect(async () => 1);
  await expect(
    cache.collect(async () => {
      throw new Error('indisponível');
    }, true),
  ).rejects.toThrow('indisponível');
  expect((await cache.collect(async () => 2)).data).toBe(2);
});
