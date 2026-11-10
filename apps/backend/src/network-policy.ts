import { lookup as resolveDns } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

type Address = { address: string; family: number };
type Resolver = (hostname: string) => Promise<Address[]>;
export type DestinationPolicy = { origins: readonly string[]; allowPrivate: boolean };

const forbidden = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  forbidden.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96],
  ['100::', 64],
  ['100:0:0:1::', 64],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2002::', 16],
  ['2001::', 32],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['3fff::', 20],
  ['5f00::', 16],
] as const)
  forbidden.addSubnet(network, prefix, 'ipv6');

const privateNetworks = new BlockList();
for (const [network, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const)
  privateNetworks.addSubnet(network, prefix, 'ipv4');
privateNetworks.addSubnet('fc00::', 7, 'ipv6');

function mappedIPv4Address(address: string): string | undefined {
  // URL canonicalizes IPv4-mapped IPv6 literals to ::ffff:hhhh:hhhh.
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/i.exec(canonical);
  if (!mapped) return undefined;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function origin(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Destino inválido.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('Destino inválido.');
  return url;
}

/** Resolve uma única vez; o chamador deve usar o IP retornado para conectar,
 * preservar hostname para Host/SNI e validação TLS e rejeitar redirecionamentos. */
export async function authorizeDestination(
  destination: string,
  policy: DestinationPolicy,
  resolver: Resolver = async (host) => resolveDns(host, { all: true, verbatim: true }),
): Promise<{ url: URL; address: Address }> {
  const url = origin(destination);
  if (
    !policy.origins.some((allowed) => {
      try {
        const value = origin(allowed);
        return value.pathname === '/' && !value.search && value.origin === url.origin;
      } catch {
        return false;
      }
    })
  )
    throw new Error('Destino não autorizado.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const ipFamily = isIP(hostname);
  const addresses: Address[] = ipFamily
    ? [{ address: hostname, family: ipFamily as 4 | 6 }]
    : await resolver(hostname);
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => {
      if (isIP(address) !== family) return true;
      const mapped = family === 6 ? mappedIPv4Address(address) : undefined;
      const classifiedAddress = mapped ?? address;
      const version = family === 4 || mapped ? 'ipv4' : 'ipv6';
      return (
        forbidden.check(classifiedAddress, version) ||
        (privateNetworks.check(classifiedAddress, version) && (mapped || !policy.allowPrivate))
      );
    })
  )
    throw new Error('Destino aponta para endereço não permitido.');
  return { url, address: addresses[0] };
}
