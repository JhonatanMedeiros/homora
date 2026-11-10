import { expect, it, vi } from 'vitest';
import { createUptimeKumaAdapter } from './uptime-kuma.js';
const config = { url: 'https://kuma.example', slug: 'home' };
it('resume o último estado das páginas públicas sem expor dados dos monitores', async () => {
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
it('rejeita slug ou origem malformados antes de acessar a rede', async () => {
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
it('retorna falha para página ausente ou resposta malformada', async () => {
  await expect(
    createUptimeKumaAdapter(async () => ({ status: 404, body: null })).collect(config),
  ).rejects.toThrow('não encontrada');
  await expect(
    createUptimeKumaAdapter(async () => ({ status: 200, body: { heartbeatList: [] } })).collect(
      config,
    ),
  ).rejects.toThrow('Resposta inválida');
});
