import { describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { getAuthorizedResponse } from './network-request.js';
import { authorizeDestination } from './network-policy.js';
import {
  checkService,
  classify,
  createServiceMonitor,
  PingUnavailableError,
} from './service-monitor.js';
import type { Service } from '@homora/shared';

vi.mock('./network-request.js', () => ({
  getAuthorizedResponse: vi.fn(),
}));
vi.mock('./network-policy.js', () => ({ authorizeDestination: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

const service = (id: number, url: string): Service => ({
  id,
  name: `Service ${id}`,
  url,
  category: 'Test',
  description: '',
});

const ok = { httpStatus: 200, latencyMs: 12 };

describe('service monitoring', () => {
  it('classifies HTTP status code without treating login or redirect as downtime', () => {
    expect(classify(200)).toEqual({ status: 'available', reason: 'responding' });
    expect(classify(204)).toEqual({ status: 'available', reason: 'responding' });
    expect(classify(302)).toEqual({ status: 'available', reason: 'redirect' });
    expect(classify(401)).toEqual({ status: 'available', reason: 'login-required' });
    expect(classify(403)).toEqual({ status: 'available', reason: 'login-required' });
    expect(classify(404)).toEqual({ status: 'unavailable', reason: 'not-found' });
    expect(classify(418)).toEqual({ status: 'unavailable', reason: 'error-status' });
    expect(classify(503)).toEqual({ status: 'unavailable', reason: 'error-status' });
  });

  it('stores HTTP status code and latency of each check', async () => {
    const codes = [302, 401, 404, 500];
    const monitor = createServiceMonitor(
      async () => codes.map((_, index) => service(index + 1, `https://s${index}.example`)),
      async (url) => ({ httpStatus: codes[Number(url.match(/s(\d)/)?.[1])], latencyMs: 7 }),
    );
    await monitor.run(true);
    const snapshot = monitor.snapshot();
    expect(snapshot[1]).toMatchObject({ reason: 'redirect', httpStatus: 302, latencyMs: 7 });
    expect(snapshot[2]).toMatchObject({ status: 'available', reason: 'login-required' });
    expect(snapshot[3]).toMatchObject({ status: 'unavailable', reason: 'not-found' });
    expect(snapshot[4]).toMatchObject({ status: 'unavailable', reason: 'error-status' });
  });

  it('denies by default and explicitly allows private while keeping standard policy', async () => {
    vi.mocked(getAuthorizedResponse).mockResolvedValue({ status: 204, body: '' });
    expect(await checkService('https://public.example/status')).toMatchObject({ httpStatus: 204 });
    expect(getAuthorizedResponse).toHaveBeenCalledWith(
      'https://public.example/status',
      {
        origins: ['https://public.example'],
        allowPrivate: false,
      },
      { timeoutMs: 8000, reportRedirect: true },
    );
    expect(await checkService('http://192.168.1.20:8096/health', true)).toMatchObject({
      httpStatus: 204,
    });
    expect(getAuthorizedResponse).toHaveBeenLastCalledWith(
      'http://192.168.1.20:8096/health',
      { origins: ['http://192.168.1.20:8096'], allowPrivate: true },
      { timeoutMs: 8000, reportRedirect: true },
    );
  });

  it('passes individual opt-in to checker and keeps false for legacy services', async () => {
    const check = vi.fn(async () => ok);
    const monitor = createServiceMonitor(
      async () => [
        service(1, 'http://192.168.1.2'),
        { ...service(2, 'http://[fd00::1]'), allowPrivate: true },
      ],
      check,
    );
    await monitor.run(true);
    expect(check).toHaveBeenNthCalledWith(1, 'http://192.168.1.2', false, 'http', null);
    expect(check).toHaveBeenNthCalledWith(2, 'http://[fd00::1]', true, 'http', null);
  });

  it('returns unknown status before execution and caches attempts', async () => {
    let time = 1_800_000_000_000;
    const check = vi.fn(async (url: string) => {
      if (url.includes('fail')) throw new Error('connection refused');
      return ok;
    });
    const monitor = createServiceMonitor(
      async () => [service(1, 'https://ok.example'), service(2, 'https://fail.example')],
      check,
      () => time,
    );
    expect(monitor.snapshot()).toEqual({});
    await monitor.run();
    const attempt = new Date(time).toISOString();
    expect(monitor.snapshot()).toEqual({
      1: {
        status: 'available',
        lastAttempt: attempt,
        reason: 'responding',
        httpStatus: 200,
        latencyMs: 12,
      },
      2: {
        status: 'unavailable',
        lastAttempt: attempt,
        reason: 'no-response',
        httpStatus: null,
        latencyMs: null,
      },
    });
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(2);
    time += 60_001;
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(4);
    await monitor.invalidate();
    // Nothing changed in the configuration, so nothing is probed again.
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('on invalidation probes only new or edited services and publishes only on change', async () => {
    let list = [service(1, 'https://a.example'), service(2, 'https://b.example')];
    const check = vi.fn<(url: string) => Promise<typeof ok>>(async () => ok);
    const publish = vi.fn();
    const monitor = createServiceMonitor(async () => list, check, Date.now, publish);
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    // An idle cycle neither probes nor rewrites observations.
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    list = [list[0]!, service(2, 'https://b2.example'), service(3, 'https://c.example')];
    await monitor.invalidate();
    expect(check.mock.calls.map(([url]) => url)).toEqual([
      'https://a.example',
      'https://b.example',
      'https://b2.example',
      'https://c.example',
    ]);
    expect(publish).toHaveBeenCalledTimes(2);
    list = [list[0]!];
    await monitor.invalidate();
    expect(check).toHaveBeenCalledTimes(4);
    expect(Object.keys(monitor.snapshot())).toEqual(['1']);
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it('isolates repository failures and prunes state for deleted services', async () => {
    let list = [service(1, 'https://ok.example')];
    const monitor = createServiceMonitor(
      async () => list,
      async () => ok,
    );
    await monitor.run();
    list = [];
    await monitor.run(true);
    expect(monitor.snapshot()).toEqual({});
    const unavailable = createServiceMonitor(async () => {
      throw new Error('database unavailable');
    });
    await expect(unavailable.run(true)).resolves.toBeUndefined();
    expect(unavailable.snapshot()).toEqual({});
  });

  it('checks all services, without a fixed limit on quantity', async () => {
    const services = Array.from({ length: 60 }, (_, index) =>
      service(index + 1, `https://service-${index + 1}.example`),
    );
    const check = vi.fn(async () => ok);
    const monitor = createServiceMonitor(async () => services, check);
    await monitor.run(true);
    expect(check).toHaveBeenCalledTimes(60);
    expect(Object.values(monitor.snapshot()).every((s) => s.reason === 'responding')).toBe(true);
  });

  it('stops initiating checks when budget is exhausted and starts with oldest in next cycle', async () => {
    let time = 1_800_000_000_000;
    const services = Array.from({ length: 12 }, (_, index) =>
      service(index + 1, `https://service-${index + 1}.example`),
    );
    // Each check "consumes" 10s of clock, so cycle budget is exhausted
    // after the first batch of five in parallel.
    const checked: string[] = [];
    const check = vi.fn(async (url: string) => {
      checked.push(url);
      time += 10_000;
      return ok;
    });
    const monitor = createServiceMonitor(
      async () => services,
      check,
      () => time,
    );
    await monitor.run(true);
    const first = checked.length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(12);
    const snapshot = monitor.snapshot();
    const unchecked = Object.entries(snapshot).filter(([, s]) => s.reason === 'unchecked');
    expect(unchecked.length).toBe(12 - first);
    const waiting = unchecked.map(([id]) => Number(id));
    checked.length = 0;
    time += 60_001;
    await monitor.run(true);
    // Those left unchecked take precedence over already checked ones.
    expect(checked.length).toBeGreaterThan(0);
    const waitingUrls = new Set(waiting.map((id) => `https://service-${id}.example`));
    expect(checked.every((url) => waitingUrls.has(url))).toBe(true);
  });

  it('maintains previous state of a service while next cycle has not reached it yet', async () => {
    let time = 1_800_000_000_000;
    let code = 200;
    const monitor = createServiceMonitor(
      async () => [service(1, 'https://a.example')],
      async () => ({ httpStatus: code, latencyMs: 3 }),
      () => time,
    );
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'responding' });
    code = 500;
    time += 60_001;
    const run = monitor.run();
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'responding' });
    await run;
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'error-status' });
  });

  it('respects per-service check interval and uses 60s when none is defined', async () => {
    let time = 1_800_000_000_000;
    const check = vi.fn(async (url: string) => (url ? ok : ok));
    const monitor = createServiceMonitor(
      async () => [
        { ...service(1, 'https://fast.example'), checkInterval: 30 },
        service(2, 'https://default.example'),
        { ...service(3, 'https://slow.example'), checkInterval: 300 },
      ],
      check,
      () => time,
    );
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(3);
    time += 30_000;
    await monitor.run();
    expect(check.mock.calls.slice(3).map(([url]) => url)).toEqual(['https://fast.example']);
    time += 30_000;
    await monitor.run();
    expect(
      check.mock.calls
        .slice(4)
        .map(([url]) => url)
        .sort(),
    ).toEqual(['https://default.example', 'https://fast.example']);
    time += 240_000;
    await monitor.run();
    expect(check.mock.calls.some(([url]) => url === 'https://slow.example')).toBe(true);
    expect(check.mock.calls.filter(([url]) => url === 'https://slow.example')).toHaveLength(2);
  });

  it('passes check type and treats successful ping as available', async () => {
    const check = vi.fn(async (_url: string, _private?: boolean, type?: string) =>
      type === 'ping' ? { httpStatus: null, latencyMs: 4 } : ok,
    );
    const monitor = createServiceMonitor(
      async () => [{ ...service(1, 'http://192.168.1.9'), checkType: 'ping', allowPrivate: true }],
      check,
    );
    await monitor.run(true);
    expect(check).toHaveBeenCalledWith('http://192.168.1.9', true, 'ping', null);
    expect(monitor.snapshot()[1]).toMatchObject({
      status: 'available',
      reason: 'reachable',
      httpStatus: null,
      latencyMs: 4,
    });
  });

  it('unanswered ping is unavailable; without ping binary service remains unchecked', async () => {
    let failure: Error = new Error('timeout');
    const monitor = createServiceMonitor(
      async () => [{ ...service(1, 'http://192.168.1.9'), checkType: 'ping' }],
      async () => {
        throw failure;
      },
    );
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'unavailable', reason: 'no-response' });
    failure = new PingUnavailableError();
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'unknown', reason: 'unchecked' });
  });

  it('executes ping only on authorized IP, without shell, and parses latency', async () => {
    vi.mocked(authorizeDestination).mockResolvedValue({
      url: new URL('http://nas.lan/'),
      address: { address: '192.168.1.7', family: 4 },
    });
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (e: null, out: string) => void,
    ) => {
      cb(null, '64 bytes from 192.168.1.7: icmp_seq=1 ttl=64 time=3.42 ms');
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).resolves.toEqual({
      httpStatus: null,
      latencyMs: 3,
    });
    expect(authorizeDestination).toHaveBeenCalledWith('http://nas.lan/', {
      origins: ['http://nas.lan'],
      allowPrivate: true,
    });
    expect(vi.mocked(execFile).mock.calls[0].slice(0, 2)).toEqual([
      'ping',
      ['-4', '-c', '1', '-W', '2', '-n', '192.168.1.7'],
    ]);
    vi.mocked(execFile).mockImplementation(((
      _f: string,
      _a: string[],
      _o: unknown,
      cb: (e: Error) => void,
    ) => {
      cb(Object.assign(new Error('x'), { code: 'ENOENT' }));
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).rejects.toBeInstanceOf(
      PingUnavailableError,
    );
    vi.mocked(execFile).mockImplementation(((
      _f: string,
      _a: string[],
      _o: unknown,
      cb: (e: Error) => void,
    ) => {
      cb(Object.assign(new Error('x'), { code: 126 }));
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).rejects.toBeInstanceOf(
      PingUnavailableError,
    );
    vi.mocked(authorizeDestination).mockRejectedValue(new Error('Destination not authorized.'));
    await expect(checkService('http://nas.lan/', false, 'ping')).rejects.toThrow('authorized');
  });
});

it('applies an explicit expected status while preserving the default classifier', () => {
  for (const code of [200, 301, 302, 401, 403, 404, 500]) {
    expect(classify(code, String(code)).status).toBe('available');
    expect(classify(code, code === 200 ? '302' : '200')).toEqual({
      status: 'unavailable',
      reason: 'unexpected-status',
    });
  }
  expect(classify(201, '2xx').status).toBe('available');
  expect(classify(302, '3xx').status).toBe('available');
  expect(classify(302)).toEqual({ status: 'available', reason: 'redirect' });
});

it('checks the configured path on the same origin and applies the expectation', async () => {
  const check = vi.fn(async () => ({ httpStatus: 302, latencyMs: 10 }));
  const monitor = createServiceMonitor(
    async () => [
      {
        ...service(1, 'https://example.test/link?q=1'),
        checkPath: '/health?full=1',
        expectedStatus: '200',
      },
    ],
    check,
  );
  await monitor.run();
  expect(check).toHaveBeenCalledWith('https://example.test/health?full=1', false, 'http', null);
  expect(monitor.snapshot()[1]).toMatchObject({
    status: 'unavailable',
    reason: 'unexpected-status',
    httpStatus: 302,
    expectedStatus: '200',
  });
});
