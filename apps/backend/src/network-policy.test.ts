import { expect, it, vi } from 'vitest';
import { authorizeDestination, isPrivateDestination } from './network-policy.js';

it.each([
  ['10.0.0.1', true],
  ['172.31.0.1', true],
  ['192.168.1.1', true],
  ['fd00::1', true],
  ['8.8.8.8', false],
  ['2606:4700:4700::1111', false],
  ['::ffff:192.168.1.1', false],
  ['127.0.0.1', false],
  ['not-an-ip', false],
])('classifies %s for private-only trust', (address, expected) => {
  expect(isPrivateDestination(address)).toBe(expected);
});

const policy = { origins: ['https://service.example:443'], allowPrivate: true };
it('requires exact origin, without credentials or unsafe schemes', async () => {
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
  '::ffff:192.168.1.1',
  '::ffff:c0a8:101',
  '::a9fe:a9fe',
  '100::1',
  '100:0:0:1::1',
  '3fff::1',
  '5f00::1',
  '64:ff9b::a9fe:a9fe',
  '2002:7f00:1::',
  'ff02::1',
])('blocks sensitive address %s even with private networks allowed', async (address) => {
  const family = address.includes(':') ? (6 as const) : (4 as const);
  await expect(
    authorizeDestination('https://service.example', policy, async () => [{ address, family }]),
  ).rejects.toMatchObject({ privateNetwork: false });
});

it('requires explicit permission for private destinations and rejects mixed DNS', async () => {
  const privateAddress = { address: '192.168.0.5', family: 4 as const };
  await expect(
    authorizeDestination(
      'https://service.example',
      { ...policy, allowPrivate: false },
      async () => [privateAddress],
    ),
  ).rejects.toMatchObject({ code: 'destination-disallowed', privateNetwork: true });
  await expect(
    authorizeDestination('https://service.example', policy, async () => [
      privateAddress,
      { address: '169.254.169.254', family: 4 },
    ]),
  ).rejects.toThrow();
});

it('rejects DNS response mixing public and private address even with opt-in', async () => {
  await expect(
    authorizeDestination('https://service.example', policy, async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '192.168.0.5', family: 4 },
    ]),
  ).rejects.toThrow();
});

it('allows public IPv4-mapped address after classification as IPv4', async () => {
  await expect(
    authorizeDestination('https://service.example', policy, async () => [
      { address: '::ffff:8.8.8.8', family: 6 },
    ]),
  ).resolves.toMatchObject({ address: { address: '::ffff:8.8.8.8', family: 6 } });
});

it('returns already authorized IP for connection without second DNS resolution', async () => {
  const dns = vi
    .fn()
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
  const target = await authorizeDestination('https://service.example/api', policy, dns);
  expect(target.address).toEqual({ address: '10.0.0.1', family: 4 });
  expect(dns).toHaveBeenCalledTimes(1);
  await expect(authorizeDestination('https://service.example/api', policy, dns)).rejects.toThrow();
});
