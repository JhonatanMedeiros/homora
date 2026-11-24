import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as network from '../network-request.js';
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

describe('integration session transport with a fixed query and a response code', () => {
  // Synthetic second profile: a nested result, a numeric success code, a fixed login query and an
  // enumerated authorization format. It shows the contract is generic; it names no real service.
  const codeData = { ...data, tenant: 'tenant-0001' };
  const codeCredentials = { secret: 'client-secret-value', tokenId: 'client-id-value' };
  const codeProfile = {
    loginPath: '/auth/token',
    loginQuery: { grant_type: 'client_credentials' },
    body: {
      tenant: { source: 'config', key: 'tenant' },
      client_id: { source: 'tokenId' },
      client_secret: { source: 'secret' },
    },
    tokenPath: ['result', 'accessToken'],
    validityPath: ['result', 'expiresIn'],
    successCode: { path: ['errorCode'], value: 0 },
    tokenFormat: 'printable',
    sendAs: { type: 'authorization', scheme: 'access-token' },
    refreshOnSuccess: false,
  } as const;
  const codeLogin = (over: Record<string, unknown> = {}, token = 'tok-1', expiresIn = 7200) => ({
    status: 200,
    body: JSON.stringify({
      errorCode: 0,
      msg: 'Success.',
      result: {
        accessToken: token,
        tokenType: 'bearer',
        expiresIn,
        refreshToken: 'refresh-secret',
      },
      ...over,
    }),
  });
  const make = (profile: unknown = codeProfile, creds = codeCredentials) =>
    createIntegrationTransport(codeData, creds, 'error', undefined, profile as typeof codeProfile);

  it('posts the fixed query and body, then sends the token in the enumerated format', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(codeLogin())
      .mockResolvedValue(summary);
    const result = await make()(request);
    expect(send.mock.calls[0]?.[0]).toBe(`${data.url}/auth/token?grant_type=client_credentials`);
    expect(send.mock.calls[0]?.[2]).toMatchObject({
      jsonBody: JSON.stringify({
        tenant: 'tenant-0001',
        client_id: 'client-id-value',
        client_secret: 'client-secret-value',
      }),
      sensitiveBody: true,
    });
    expect(send.mock.calls[1]?.[2]?.headers).toEqual({ authorization: 'AccessToken=tok-1' });
    expect(JSON.stringify(result)).not.toMatch(/tok-1|refresh-secret|client-secret-value/);
  });
  it('rejects a login with HTTP 200 and a nonzero or missing code without leaking output', async () => {
    for (const body of [
      { errorCode: -44106, msg: 'client-secret-value rejected' },
      { errorCode: '0' },
      { errorCode: 0.5 },
      { errorCode: undefined, msg: 'no code' },
    ]) {
      vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValueOnce(
        codeLogin(body as Record<string, unknown>),
      );
      const error = await make()(request).catch((e: unknown) => e as Error);
      expect(error).toEqual(new Error('Integration authentication failed.'));
      expect(String(error)).not.toMatch(/client-secret-value|rejected/);
    }
  });
  it('rejects a missing or malformed token, expiry or non-JSON login body', async () => {
    for (const result of [
      { expiresIn: 60 },
      { accessToken: 'has space', expiresIn: 60 },
      { accessToken: 'tok', expiresIn: 'soon' },
      { accessToken: 'tok', expiresIn: -1 },
    ]) {
      vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValueOnce(codeLogin({ result }));
      await expect(make()(request)).rejects.toThrow('Integration authentication failed.');
    }
    vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValueOnce({
      status: 400,
      body: '<html>bad</html>',
    });
    await expect(make()(request)).rejects.toThrow('Integration authentication failed.');
  });
  it('keeps the session until its bounded expiry, then logs in again once', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(codeLogin({}, 'tok-1', 100))
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce(codeLogin({}, 'tok-2', 100))
      .mockResolvedValue(summary);
    const transport = make();
    await transport(request);
    vi.advanceTimersByTime(50_000);
    await transport(request);
    vi.advanceTimersByTime(60_000);
    await transport(request);
    expect(send).toHaveBeenCalledTimes(5);
    expect(send.mock.calls[4]?.[2]?.headers).toEqual({ authorization: 'AccessToken=tok-2' });
  });
  it('treats an error code in a read body as data, never as expiry, and retries a 401 once', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(codeLogin())
      .mockResolvedValueOnce({ status: 200, body: '{"errorCode":-44112}' });
    expect(await make()(request)).toEqual({ status: 200, body: { errorCode: -44112 } });
    expect(send).toHaveBeenCalledTimes(2);
    send
      .mockResolvedValueOnce(codeLogin())
      .mockResolvedValueOnce({ status: 401, body: '' })
      .mockResolvedValueOnce(codeLogin({}, 'tok-2'))
      .mockResolvedValueOnce({ status: 401, body: '' });
    expect((await make()(request)).status).toBe(401);
    expect(send).toHaveBeenCalledTimes(6);
  });
  it('deduplicates concurrent logins and isolates sessions per transport', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(codeLogin())
      .mockResolvedValue(summary);
    const transport = make();
    await Promise.all([transport(request), transport(request), transport(request)]);
    expect(send.mock.calls.filter(([url]) => String(url).includes('/auth/token'))).toHaveLength(1);
  });
  it('rejects unsafe or duplicated fixed login queries before any network request', async () => {
    const send = vi.spyOn(network, 'getAuthorizedResponse');
    const bad: unknown[] = [
      { grant_type: 'a&b=c' },
      { grant_type: 'a#b' },
      { grant_type: 'a b' },
      { grant_type: '../x' },
      { grant_type: '%2f' },
      { grant_type: '' },
      { grant_type: 'x'.repeat(65) },
      { 'grant type': 'x' },
      { 'a=b': 'x' },
      { Grant: 'x', grant: 'y' },
      { client_secret: 'x' },
      { api_key: 'x' },
      { access_token: 'x' },
      { grant_type: codeCredentials.secret },
      { grant_type: codeCredentials.tokenId },
      { a: '1', b: '2', c: '3', d: '4', e: '5' },
      {},
      [],
      'grant_type=x',
      null,
    ];
    for (const loginQuery of bad)
      await expect(make({ ...codeProfile, loginQuery })(request)).rejects.toThrow(
        'authentication unavailable',
      );
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects unknown authorization schemes and unsafe success codes', async () => {
    const send = vi.spyOn(network, 'getAuthorizedResponse');
    const bad = [
      { ...codeProfile, sendAs: { type: 'authorization', scheme: 'Basic' } },
      { ...codeProfile, sendAs: { type: 'authorization', scheme: 'constructor' } },
      { ...codeProfile, sendAs: { type: 'authorization' } },
      { ...codeProfile, sendAs: { type: 'custom', name: 'authorization' } },
      { ...codeProfile, successCode: { path: ['__proto__'], value: 0 } },
      { ...codeProfile, successCode: { path: ['errorCode'], value: 0.5 } },
      { ...codeProfile, successCode: { path: ['errorCode'], value: '0' } },
      { ...codeProfile, successCode: { path: [], value: 0 } },
      { ...codeProfile, successCode: [] },
    ];
    for (const profile of bad)
      await expect(make(profile)(request)).rejects.toThrow('authentication unavailable');
    expect(send).not.toHaveBeenCalled();
  });
  it('does not widen the Pi-hole profile: no query, no code, same wire format', async () => {
    const send = vi
      .spyOn(network, 'getAuthorizedResponse')
      .mockResolvedValueOnce(login())
      .mockResolvedValue(summary);
    await createIntegrationTransport(data, credentials, 'error', undefined, profile)(request);
    expect(send.mock.calls[0]?.[0]).toBe(`${data.url}/api/auth`);
    expect(send.mock.calls[1]?.[2]?.headers).toEqual({ 'x-ftl-sid': 'session123' });
  });
});
