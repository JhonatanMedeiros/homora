import { EventEmitter } from 'node:events';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import * as networkPolicy from './network-policy.js';
import { getAuthorizedJson, getAuthorizedResponse } from './network-request.js';

afterEach(() => vi.restoreAllMocks());
it('pins validated address and preserves original URL for Host and TLS', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/data'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 200, destroy: vi.fn() });
  const spy = vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      res.emit('data', Buffer.from('{"ok":true}'));
      res.emit('end');
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(
    getAuthorizedJson('http://service.test/data', {
      origins: ['http://service.test'],
      allowPrivate: true,
    }),
  ).resolves.toEqual({ ok: true });
  expect(String(spy.mock.calls[0][0])).toBe('http://service.test/data');
  const options = spy.mock.calls[0][1] as {
    agent: boolean;
    lookup: (
      host: string,
      options: { all: boolean },
      callback: (...args: unknown[]) => void,
    ) => void;
  };
  expect(options.agent).toBe(false);
  const callback = vi.fn();
  options.lookup('service.test', { all: false }, callback);
  expect(callback).toHaveBeenCalledWith(null, '10.0.0.4', 4);
});

it('prevents credentials over HTTP and arbitrary headers', async () => {
  const authorize = vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/data'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const policy = { origins: ['http://service.test'], allowPrivate: true };
  const spy = vi.spyOn(http, 'get');
  await expect(
    getAuthorizedResponse('http://service.test/data', policy, {
      headers: { authorization: 'Bearer token' },
    }),
  ).rejects.toThrow('HTTPS');
  await expect(
    getAuthorizedResponse('http://service.test/data', policy, {
      headers: { 'x-ftl-sid': 'session' },
    }),
  ).rejects.toThrow('HTTPS');
  await expect(
    getAuthorizedResponse('http://service.test/data', policy, { headers: { Host: 'example.com' } }),
  ).rejects.toThrow('headers');
  expect(spy).not.toHaveBeenCalled();
  expect(authorize).toHaveBeenCalledTimes(2);
});

it('rejects a credential-bearing POST body over HTTP before opening a socket', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/auth'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const request = vi.spyOn(http, 'request');
  await expect(
    getAuthorizedResponse(
      'http://service.test/auth',
      { origins: ['http://service.test'], allowPrivate: true },
      { jsonBody: '{"password":"test"}', sensitiveBody: true },
    ),
  ).rejects.toThrow('HTTPS');
  expect(request).not.toHaveBeenCalled();
});

it('returns sanitized status code without propagating remote error body', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/data'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 401, destroy: vi.fn() });
  vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(
    getAuthorizedResponse('http://service.test/data', {
      origins: ['http://service.test'],
      allowPrivate: true,
    }),
  ).resolves.toEqual({ status: 401, body: '' });
});

it('rejects redirects without following destination', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/data'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 302, destroy: vi.fn() });
  const spy = vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(
    getAuthorizedJson('http://service.test/data', {
      origins: ['http://service.test'],
      allowPrivate: true,
    }),
  ).rejects.toThrow('HTTP 302');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(res.destroy).toHaveBeenCalled();
});

it('reports 3xx status code only when requested, without following redirect', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 302, destroy: vi.fn() });
  const spy = vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  const policy = { origins: ['http://service.test'], allowPrivate: true };
  await expect(
    getAuthorizedResponse('http://service.test/', policy, { reportRedirect: true }),
  ).resolves.toEqual({ status: 302, body: '' });
  await expect(getAuthorizedResponse('http://service.test/', policy)).rejects.toThrow('302');
  expect(spy).toHaveBeenCalledTimes(2);
});

it('sends JSON with the pinned address and does not follow redirects', async () => {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/hook'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn(), end: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 302, destroy: vi.fn() });
  const spy = vi.spyOn(http, 'request').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.request>;
  });
  await expect(
    getAuthorizedResponse(
      'http://service.test/hook',
      { origins: ['http://service.test'], allowPrivate: true },
      { jsonBody: '{"event":"down"}' },
    ),
  ).rejects.toThrow('redirect not allowed');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(req.end).toHaveBeenCalledWith('{"event":"down"}');
  expect(res.destroy).toHaveBeenCalled();
  const options = spy.mock.calls[0][1] as {
    method: string;
    lookup: (
      host: string,
      options: { all: boolean },
      callback: (...args: unknown[]) => void,
    ) => void;
  };
  expect(options.method).toBe('POST');
  const callback = vi.fn();
  options.lookup('service.test', { all: false }, callback);
  expect(callback).toHaveBeenCalledWith(null, '10.0.0.4', 4);
});

function respondWith(statusCode: number, headers: Record<string, string>) {
  vi.spyOn(networkPolicy, 'authorizeDestination').mockResolvedValue({
    url: new URL('http://service.test/data'),
    address: { address: '10.0.0.4', family: 4 },
  });
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode, headers, destroy: vi.fn() });
  vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[2] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
}
const policy = { origins: ['http://service.test'], allowPrivate: true };

it('exposes Retry-After seconds of a 429, clamped, and ignores invalid values', async () => {
  for (const [header, expected] of [
    ['30', 30],
    ['0', 1],
    ['99999', 3600],
    [' 5 ', 5],
    ['Wed, 21 Oct 2026 07:28:00 GMT', undefined],
    ['1.5', undefined],
    ['-3', undefined],
    ['', undefined],
  ] as const) {
    vi.restoreAllMocks();
    respondWith(429, { 'retry-after': header });
    const response = await getAuthorizedResponse('http://service.test/data', policy);
    expect(response.status).toBe(429);
    expect(response.retryAfterSeconds).toBe(expected);
  }
});

it('does not expose Retry-After for other statuses and still rejects extra request headers', async () => {
  respondWith(503, { 'retry-after': '30' });
  const response = await getAuthorizedResponse('http://service.test/data', policy);
  expect(response).toEqual({ status: 503, body: '' });
  await expect(
    getAuthorizedResponse('http://service.test/data', policy, {
      headers: { 'retry-after': '1' },
    }),
  ).rejects.toThrow('headers');
});
