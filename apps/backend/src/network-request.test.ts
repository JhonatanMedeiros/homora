import { EventEmitter } from 'node:events';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import * as networkPolicy from './network-policy.js';
import { getAuthorizedJson } from './network-request.js';

afterEach(() => vi.restoreAllMocks());
it('fixa endereço validado e preserva URL original para Host e TLS', async () => {
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

it('rejeita redirecionamentos sem seguir o destino', async () => {
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
