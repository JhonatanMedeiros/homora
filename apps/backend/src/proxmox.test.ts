import { EventEmitter } from 'node:events';
import https from 'node:https';
import { rootCertificates } from 'node:tls';
import { afterEach, expect, it, vi } from 'vitest';
import { readProxmox } from './proxmox.js';
afterEach(() => vi.restoreAllMocks());
it('sends token only to read HTTPS endpoint and returns inventory', async () => {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setEncoding: vi.fn(),
    resume: vi.fn(),
  });
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const spy = vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    const callback = args[2] as (res: typeof response) => void;
    queueMicrotask(() => {
      callback(response);
      response.emit('data', JSON.stringify({ data: [{ type: 'node', node: 'pve' }] }));
      response.emit('end');
    });
    return request as unknown as ReturnType<typeof https.get>;
  });
  const result = await readProxmox({
    url: 'https://pve.example:8006',
    tokenId: 'user@pve!homora',
    secret: 'token',
  });
  expect(result).toEqual([{ type: 'node', node: 'pve' }]);
  expect(spy).toHaveBeenCalledWith(
    'https://pve.example:8006/api2/json/cluster/resources',
    expect.objectContaining({ headers: { Authorization: 'PVEAPIToken=user@pve!homora=token' } }),
    expect.any(Function),
  );
});

it('uses configured CA without disabling TLS verification', async () => {
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const spy = vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setEncoding: vi.fn(),
      resume: vi.fn(),
    });
    queueMicrotask(() => {
      (args[2] as (res: typeof response) => void)(response);
      response.emit('data', '{"data":[]}');
      response.emit('end');
    });
    return request as unknown as ReturnType<typeof https.get>;
  });
  const ca = rootCertificates[0];
  await readProxmox({
    url: 'https://pve.example',
    tokenId: 'user@pve!homora',
    secret: 'token',
    ca,
  });
  const options = spy.mock.calls[0][1] as https.RequestOptions;
  expect(options.ca).toContain(ca);
  expect(options.rejectUnauthorized).not.toBe(false);
});

it.each(['aborted', 'error'])('rejects an interrupted response (%s)', async (event) => {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setEncoding: vi.fn(),
    resume: vi.fn(),
  });
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    const callback = args[2] as (res: typeof response) => void;
    queueMicrotask(() => {
      callback(response);
      response.emit(event, new Error('interrupted connection'));
    });
    return request as unknown as ReturnType<typeof https.get>;
  });
  await expect(
    readProxmox({ url: 'https://pve.example', tokenId: 'user@pve!homora', secret: 'token' }),
  ).rejects.toMatchObject({ code: 'proxmox-incomplete-response' });
});

it('rejects inventory that is not a list', async () => {
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setEncoding: vi.fn(),
    resume: vi.fn(),
  });
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    const callback = args[2] as (res: typeof response) => void;
    queueMicrotask(() => {
      callback(response);
      response.emit('data', JSON.stringify({ data: {} }));
      response.emit('end');
    });
    return request as unknown as ReturnType<typeof https.get>;
  });
  await expect(
    readProxmox({ url: 'https://pve.example', tokenId: 'user@pve!homora', secret: 'token' }),
  ).rejects.toMatchObject({ code: 'proxmox-invalid-response' });
});

it.each([
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'proxmox-tls'],
  ['ENOTFOUND', 'proxmox-dns'],
  ['ECONNREFUSED', 'proxmox-refused'],
  ['ETIMEDOUT', 'proxmox-unreachable'],
  ['OTHER', 'proxmox-connection-failed'],
])('provides safe diagnosis for network error %s', async (code, errorCode) => {
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  vi.spyOn(https, 'get').mockImplementation(() => {
    queueMicrotask(() =>
      request.emit('error', Object.assign(new Error('private secret'), { code })),
    );
    return request as unknown as ReturnType<typeof https.get>;
  });
  await expect(
    readProxmox({ url: 'https://pve.example', tokenId: 'user@pve!homora', secret: 'token' }),
  ).rejects.toMatchObject({ code: errorCode });
});

it.each([
  [401, 'proxmox-unauthorized'],
  [403, 'proxmox-forbidden'],
  [500, 'proxmox-http-error'],
])('identifies HTTP response %i without disclosing body', async (statusCode, errorCode) => {
  const response = Object.assign(new EventEmitter(), { statusCode, resume: vi.fn() });
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => (args[2] as (res: typeof response) => void)(response));
    return request as unknown as ReturnType<typeof https.get>;
  });
  await expect(
    readProxmox({ url: 'https://pve.example', tokenId: 'user@pve!homora', secret: 'token' }),
  ).rejects.toMatchObject({ code: errorCode });
});
