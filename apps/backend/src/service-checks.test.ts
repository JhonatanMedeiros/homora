import net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthorizedResponse } from './network-request.js';
import { authorizeDestination } from './network-policy.js';
import { readCertificate, tcpConnect } from './network-checks.js';
import { checkService, createServiceMonitor, CERT_WARNING_DAYS } from './service-monitor.js';
import type { Service } from '@homora/shared';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));
vi.mock('./network-policy.js', () => ({ authorizeDestination: vi.fn() }));
vi.mock('./network-checks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./network-checks.js')>()),
  readCertificate: vi.fn(),
}));

const DAY = 86_400_000;
const authorize = (address = '10.0.0.5') =>
  vi.mocked(authorizeDestination).mockImplementation(async (destination) => ({
    url: new URL(destination),
    address: { address, family: 4 },
  }));
afterEach(() => vi.clearAllMocks());

describe('content checks', () => {
  const respond = (body: string, status = 200) =>
    vi.mocked(getAuthorizedResponse).mockResolvedValue({ status, body });

  it('keyword: passes when the text is there and fails with content-mismatch when it is not', async () => {
    respond('<p>Status: ALL GOOD</p>');
    expect(await checkService('https://a.test/', false, 'keyword', 'all good')).toMatchObject({
      httpStatus: 200,
    });
    expect(
      (await checkService('https://a.test/', false, 'keyword', 'all good')).outcome,
    ).toBeUndefined();
    respond('<p>Maintenance</p>');
    expect(await checkService('https://a.test/', false, 'keyword', 'all good')).toMatchObject({
      outcome: { status: 'unavailable', reason: 'content-mismatch' },
    });
    expect(getAuthorizedResponse).toHaveBeenLastCalledWith(
      'https://a.test/',
      { origins: ['https://a.test'], allowPrivate: false },
      expect.objectContaining({ maxBodyBytes: 1_000_000 }),
    );
  });

  it('json: compares the value at the path', async () => {
    respond('{"status":"ok","db":{"up":true}}');
    expect(
      (await checkService('https://a.test/', false, 'json', 'db.up=true')).outcome,
    ).toBeUndefined();
    expect(await checkService('https://a.test/', false, 'json', 'status=down')).toMatchObject({
      outcome: { reason: 'content-mismatch' },
    });
  });

  it('reads no body without an expectation, and does not judge answers that are not 2xx', async () => {
    respond('', 503);
    expect(await checkService('https://a.test/', false, 'keyword', null)).toEqual({
      httpStatus: 503,
      latencyMs: expect.any(Number),
    });
    expect(getAuthorizedResponse).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.not.objectContaining({ maxBodyBytes: expect.anything() }),
    );
    expect((await checkService('https://a.test/', false, 'keyword', 'x')).outcome).toBeUndefined();
  });
});

describe('connection checks', () => {
  it('tcp: connects to the port of the URL through the destination policy', async () => {
    const server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as net.AddressInfo;
    authorize('127.0.0.1');
    try {
      const result = await checkService(`http://nas.lan:${port}/`, true, 'tcp');
      expect(result).toMatchObject({ httpStatus: null });
      expect(authorizeDestination).toHaveBeenCalledWith(`http://nas.lan:${port}/`, {
        origins: [`http://nas.lan:${port}`],
        allowPrivate: true,
      });
    } finally {
      server.close();
    }
    await expect(tcpConnect('127.0.0.1', port, 500)).rejects.toThrow('Connection failed.');
  });

  it('dns: succeeds when the name resolves and fails when the policy lookup does', async () => {
    authorize();
    expect(await checkService('https://nas.lan/', false, 'dns')).toMatchObject({
      httpStatus: null,
    });
    vi.mocked(authorizeDestination).mockRejectedValue(new Error('not found'));
    await expect(checkService('https://nas.lan/', false, 'dns')).rejects.toThrow();
  });

  it('tls: separates valid, expiring, expired and untrusted certificates', async () => {
    authorize();
    const now = 1_800_000_000_000;
    const read = (validTo: number, authorized = true, error: string | null = null) =>
      vi.mocked(readCertificate).mockResolvedValue({ validTo, authorized, error, latencyMs: 30 });
    read(now + 60 * DAY);
    expect(await checkService('https://nas.lan/', false, 'tls', null, () => now)).toMatchObject({
      outcome: { status: 'available', reason: 'reachable' },
      certExpiresAt: now + 60 * DAY,
    });
    read(now + (CERT_WARNING_DAYS - 1) * DAY);
    expect((await checkService('https://nas.lan/', false, 'tls', null, () => now)).outcome).toEqual(
      {
        status: 'available',
        reason: 'cert-expiring',
      },
    );
    read(now - DAY, false, 'CERT_HAS_EXPIRED');
    expect((await checkService('https://nas.lan/', false, 'tls', null, () => now)).outcome).toEqual(
      {
        status: 'unavailable',
        reason: 'cert-expired',
      },
    );
    read(now + 90 * DAY, false, 'DEPTH_ZERO_SELF_SIGNED_CERT');
    expect((await checkService('https://nas.lan/', false, 'tls', null, () => now)).outcome).toEqual(
      {
        status: 'unavailable',
        reason: 'cert-invalid',
      },
    );
    expect(readCertificate).toHaveBeenCalledWith('10.0.0.5', 'nas.lan', 443);
  });
});

describe('monitor', () => {
  it('uses the check outcome, keeps the certificate expiry and ignores the check path for connection checks', async () => {
    const services: Service[] = [
      {
        id: 1,
        name: 'A',
        url: 'https://a.test/',
        category: 'x',
        description: '',
        checkType: 'tls',
        checkPath: '/ignored',
      },
      {
        id: 2,
        name: 'B',
        url: 'https://b.test/',
        category: 'x',
        description: '',
        checkType: 'keyword',
        checkMatch: 'ok',
      },
    ];
    const check = vi.fn(async (url: string) =>
      url.includes('a.test')
        ? {
            httpStatus: null,
            latencyMs: 5,
            outcome: { status: 'available' as const, reason: 'cert-expiring' as const },
            certExpiresAt: 123,
          }
        : {
            httpStatus: 200,
            latencyMs: 5,
            outcome: { status: 'unavailable' as const, reason: 'content-mismatch' as const },
          },
    );
    const monitor = createServiceMonitor(async () => services, check);
    await monitor.run(true);
    expect(check).toHaveBeenCalledWith('https://a.test/', false, 'tls', null);
    expect(check).toHaveBeenCalledWith('https://b.test/', false, 'keyword', 'ok');
    expect(monitor.snapshot()[1]).toMatchObject({
      status: 'available',
      reason: 'cert-expiring',
      certExpiresAt: 123,
    });
    expect(monitor.snapshot()[2]).toMatchObject({
      status: 'unavailable',
      reason: 'content-mismatch',
      httpStatus: 200,
    });
  });
});
