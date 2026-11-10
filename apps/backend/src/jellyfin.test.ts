import { expect, it, vi } from 'vitest';
import { createJellyfinAdapter } from './jellyfin.js';

it('rejeita protocolos, credenciais e parâmetros na URL', () => {
  const adapter = createJellyfinAdapter(vi.fn());
  for (const url of [
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://example.com/?key=secret',
  ])
    expect(() => adapter.validate({ url })).toThrow();
});

it('consulta somente a API pública usando transporte injetado', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: { ServerName: 'Servidor', Version: '10.10', Id: 'privado' },
  }));
  const adapter = createJellyfinAdapter(transport);
  await expect(adapter.collect({ url: 'http://example.test/jellyfin/' })).resolves.toEqual({
    name: 'Servidor',
    version: '10.10',
  });
  expect(transport).toHaveBeenCalledWith({
    origin: 'http://example.test',
    path: '/jellyfin/System/Info/Public',
  });
});

it('sanitiza erro de rede e rejeita status e dados inesperados', async () => {
  const failed = createJellyfinAdapter(async () => {
    throw new Error('dados privados');
  });
  await expect(failed.collect({ url: 'https://example.test' })).rejects.toThrow(
    'Não foi possível consultar',
  );
  const redirect = createJellyfinAdapter(async () => ({ status: 302, body: null }));
  await expect(redirect.collect({ url: 'https://example.test' })).rejects.toThrow(
    'Resposta Jellyfin inválida',
  );
  const malformed = createJellyfinAdapter(async () => ({ status: 200, body: { ServerName: 42 } }));
  await expect(malformed.collect({ url: 'https://example.test' })).rejects.toThrow(
    'Resposta Jellyfin inválida',
  );
});
