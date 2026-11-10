import { expect, it, vi } from 'vitest';
import { createAdGuardAdapter } from './adguard.js';

const config = { url: 'https://adguard.example:3000', username: 'user', password: 'fake-secret' };
it('consulta status usando Basic Auth e limita os campos retornados', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: {
      running: true,
      protection_enabled: false,
      version: 'v0.107',
      dns_addresses: ['private'],
    },
  }));
  expect(await createAdGuardAdapter(transport).collect(config)).toEqual({
    running: true,
    protectionEnabled: false,
    version: 'v0.107',
  });
  expect(transport).toHaveBeenCalledWith({
    origin: config.url,
    path: '/control/status',
    authorization: `Basic ${Buffer.from('user:fake-secret').toString('base64')}`,
  });
});
it('valida antes de consultar e não permite credenciais em HTTP', async () => {
  const transport = vi.fn();
  const adapter = createAdGuardAdapter(transport);
  for (const changed of [
    { url: 'http://adguard.example' },
    { username: 'bad:name' },
    { password: 'bad\r\n' },
    { url: 'https://a.example/path' },
  ])
    await expect(adapter.collect({ ...config, ...changed })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it('sanitiza falhas e recusa resposta com credencial', async () => {
  const failed = createAdGuardAdapter(async () => {
    throw new Error(config.password);
  });
  await expect(failed.collect(config)).rejects.toThrow('Não foi possível conectar');
  const invalid = createAdGuardAdapter(async () => ({
    status: 200,
    body: { running: true, protection_enabled: true, version: config.password },
  }));
  await expect(invalid.collect(config)).rejects.toThrow('Resposta inválida');
});
