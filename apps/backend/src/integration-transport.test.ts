import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as network from './network-request.js';
import { createIntegrationTransport } from './integration-transport.js';

const data = { url: 'https://pihole.example.test', allowPrivate: true };
const credentials = { secret: 'private-app-password' };
const profile = {
  loginPath: '/api/auth',
  body: { password: { source: 'secret' } },
  tokenPath: ['session', 'sid'],
  validPath: ['session', 'valid'],
  validityPath: ['session', 'validity'],
  tokenFormat: 'base64',
  sendAs: { type: 'header', name: 'x-ftl-sid' },
  refreshOnSuccess: true,
} as const;
const request = { origin: data.url, path: '/api/stats/summary' };
const login = (sid = 'session123', validity = 300) => ({
  status: 200,
  body: JSON.stringify({ session: { valid: true, sid, validity } }),
});
const summary = { status: 200, body: '{"ok":true}' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('integration session transport', () => {
  it('logs in once, keeps the session out of the adapter, and pins reads to the connection policy', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login())
      .mockResolvedValue(summary);
    const transport = createIntegrationTransport(data, credentials, 'error', undefined, profile);
    expect(await transport(request)).toEqual({ status: 200, body: { ok: true } });
    await transport(request);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]).toMatchObject([
      `${data.url}/api/auth`,
      { origins: [data.url], allowPrivate: true },
      { jsonBody: JSON.stringify({ password: credentials.secret }), sensitiveBody: true },
    ]);
    expect(send.mock.calls[1]).toMatchObject([
      `${data.url}/api/stats/summary`,
      { origins: [data.url], allowPrivate: true },
      { headers: { 'x-ftl-sid': 'session123' } },
    ]);
    expect(JSON.stringify(await transport(request))).not.toContain('session123');
  });
  it('deduplicates simultaneous login requests', async () => {
    let resolve!: (value: ReturnType<typeof login>) => void;
    const waiting = new Promise<ReturnType<typeof login>>((done) => {
      resolve = done;
    });
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockImplementationOnce(() => waiting)
      .mockResolvedValue(summary);
    const transport = createIntegrationTransport(data, credentials, 'error', undefined, profile);
    const first = transport(request);
    const second = transport(request);
    expect(send).toHaveBeenCalledTimes(1);
    resolve(login());
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('renews an expired session and retries a 401 only once', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login('first', 10))
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce(login('second'))
      .mockResolvedValueOnce({ status: 401, body: '' })
      .mockResolvedValueOnce(login('third'))
      .mockResolvedValueOnce({ status: 401, body: '' });
    const transport = createIntegrationTransport(data, credentials, 'error', undefined, profile);
    await transport(request);
    vi.advanceTimersByTime(10000);
    expect(await transport(request)).toEqual({ status: 401, body: null });
    expect(send).toHaveBeenCalledTimes(6);
  });
  it('rejects malformed sessions without exposing server output or secrets', async () => {
    vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        session: { valid: true, sid: 'bad\nheader', validity: 300 },
        marker: credentials.secret,
      }),
    });
    const transport = createIntegrationTransport(data, credentials, 'error', undefined, profile);
    await expect(transport(request)).rejects.toThrow('Integration authentication failed.');
  });
  it('does not share sessions between transport instances', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login('first'))
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce(login('second'))
      .mockResolvedValueOnce(summary);
    await createIntegrationTransport(data, credentials, 'error', undefined, profile)(request);
    await createIntegrationTransport(data, credentials, 'error', undefined, profile)(request);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[3]?.[2]?.headers).toEqual({ 'x-ftl-sid': 'second' });
  });
  it('extends the local expiry after a successful read without creating extra sessions', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login('first', 10))
      .mockResolvedValue(summary);
    const transport = createIntegrationTransport(data, credentials, 'error', undefined, profile);
    await transport(request);
    vi.advanceTimersByTime(8000);
    await transport(request);
    vi.advanceTimersByTime(8000);
    await transport(request);
    expect(send).toHaveBeenCalledTimes(4);
  });
  it('supports a different login contract with user, secret and bearer token', async () => {
    const otherProfile = {
      loginPath: '/v1/login',
      body: { identity: { source: 'config', key: 'username' }, password: { source: 'secret' } },
      tokenPath: ['access_token'],
      defaultValiditySeconds: 60,
      tokenFormat: 'printable',
      sendAs: { type: 'bearer' },
      refreshOnSuccess: false,
    } as const;
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce({ status: 200, body: '{"access_token":"token-123"}' })
      .mockResolvedValue(summary);
    const transport = createIntegrationTransport(
      { ...data, username: 'service-user' },
      credentials,
      'error',
      undefined,
      otherProfile,
    );
    await transport(request);
    expect(send.mock.calls[0]?.[2]).toMatchObject({
      jsonBody: JSON.stringify({ identity: 'service-user', password: credentials.secret }),
      sensitiveBody: true,
    });
    expect(send.mock.calls[1]?.[2]?.headers).toEqual({ authorization: 'Bearer token-123' });
    vi.advanceTimersByTime(30000);
    await transport(request);
    vi.advanceTimersByTime(30000);
    send.mockResolvedValueOnce({ status: 200, body: '{"access_token":"token-456"}' });
    await transport(request);
    expect(send.mock.calls[4]?.[2]?.headers).toEqual({ authorization: 'Bearer token-456' });
  });
  it('rejects unsafe profile paths and missing credential fields before any network request', async () => {
    const send = vi.spyOn(network, 'getAuthorizedResponse');
    const unsafe = { ...profile, tokenPath: ['constructor', 'name'] };
    await expect(
      createIntegrationTransport(data, credentials, 'error', undefined, unsafe)(request),
    ).rejects.toThrow('authentication unavailable');
    const traversal = { ...profile, loginPath: '/api/../admin' };
    await expect(
      createIntegrationTransport(data, credentials, 'error', undefined, traversal)(request),
    ).rejects.toThrow('authentication unavailable');
    const missing = {
      ...profile,
      body: { password: { source: 'secret' }, user: { source: 'config', key: 'missing' } },
    } as const;
    await expect(
      createIntegrationTransport(data, credentials, 'error', undefined, missing)(request),
    ).rejects.toThrow('authentication unavailable');
    expect(send).not.toHaveBeenCalled();
  });
  it('can send a session token as a permitted API key header', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login())
      .mockResolvedValue(summary);
    const otherProfile = { ...profile, sendAs: { type: 'header', name: 'x-api-key' } } as const;
    await createIntegrationTransport(data, credentials, 'error', undefined, otherProfile)(request);
    expect(send.mock.calls[1]?.[2]?.headers).toEqual({ 'x-api-key': 'session123' });
  });
  it('does not read inherited fields from the login response', async () => {
    const send = vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValue({
      status: 200,
      body: '{"session":{"valid":true,"validity":300}}',
    });
    const inherited = { ...profile, tokenPath: ['session', 'toString'] };
    await expect(
      createIntegrationTransport(data, credentials, 'error', undefined, inherited)(request),
    ).rejects.toThrow('authentication failed');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
