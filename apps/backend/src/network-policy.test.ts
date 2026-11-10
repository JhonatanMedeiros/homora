import { expect, it, vi } from 'vitest';
import { authorizeDestination } from './network-policy.js';

const policy = { origins: ['https://service.example:443'], allowPrivate: true };
it('exige origem exata, sem credenciais ou esquemas inseguros', async () => {
  const dns = vi.fn(async () => [{ address: '10.0.0.2', family: 4 as const }]);
  for (const url of [
    'https://evil.example',
    'http://service.example',
    'https://x@service.example',
    'file:///etc/passwd',
  ])
    await expect(authorizeDestination(url, policy, dns)).rejects.toThrow();
  expect(dns).not.toHaveBeenCalled();
  await expect(
    authorizeDestination('https://service.example/api', policy, dns),
  ).resolves.toMatchObject({ address: { address: '10.0.0.2' } });
});

it.each([
  '127.0.0.1',
  '169.254.169.254',
  '0.0.0.0',
  '::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  '::a9fe:a9fe',
  '100::1',
  '3fff::1',
  '5f00::1',
  '64:ff9b::a9fe:a9fe',
  '2002:7f00:1::',
  'ff02::1',
])('bloqueia endereço sensível %s mesmo com redes privadas autorizadas', async (address) => {
  const family = address.includes(':') ? (6 as const) : (4 as const);
  await expect(
    authorizeDestination('https://service.example', policy, async () => [{ address, family }]),
  ).rejects.toThrow('não permitido');
});

it('requer permissão específica para destinos privados e rejeita DNS misto', async () => {
  const privateAddress = { address: '192.168.0.5', family: 4 as const };
  await expect(
    authorizeDestination(
      'https://service.example',
      { ...policy, allowPrivate: false },
      async () => [privateAddress],
    ),
  ).rejects.toThrow();
  await expect(
    authorizeDestination('https://service.example', policy, async () => [
      privateAddress,
      { address: '169.254.169.254', family: 4 },
    ]),
  ).rejects.toThrow();
});

it('retorna IP já autorizado para conexão sem segunda resolução DNS', async () => {
  const dns = vi
    .fn()
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
  const target = await authorizeDestination('https://service.example/api', policy, dns);
  expect(target.address).toEqual({ address: '10.0.0.1', family: 4 });
  expect(dns).toHaveBeenCalledTimes(1);
  await expect(authorizeDestination('https://service.example/api', policy, dns)).rejects.toThrow();
});
