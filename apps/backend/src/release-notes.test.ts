import { describe, expect, it, vi } from 'vitest';
import { createReleaseNotes } from './release-notes.js';
import { createAppTestContext } from './app-test-context.js';
import * as network from './network-request.js';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';

describe('release notes retrieval', () => {
  it('only requests the fixed public origin with restricted transport and caches the result', async () => {
    let time = 1;
    const request = vi.fn().mockResolvedValue({ status: 200, body: '<feed />' });
    const read = createReleaseNotes(request, () => time);
    expect(await Promise.all([read(), read()])).toEqual(['<feed />', '<feed />']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      'https://github.com/JhonatanMedeiros/homora/releases.atom',
      { origins: ['https://github.com'], allowPrivate: false },
      { timeoutMs: 8000, maxBodyBytes: 512_000, headers: { accept: 'application/atom+xml' } },
    );
    time += 6 * 60 * 60 * 1000;
    await read();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('returns no upstream details on failure and retries after a short backoff', async () => {
    let time = 0;
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('private detail'))
      .mockResolvedValue({ status: 200, body: '<feed />' });
    const read = createReleaseNotes(request, () => time);
    expect(await read()).toBeNull();
    expect(await read()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    time = 60_000;
    expect(await read()).toBe('<feed />');
  });
});

it('does not allow anonymous requests to reach the release feed', async () => {
  const { app, close } = await createAppTestContext();
  try {
    expect((await app.inject({ method: 'GET', url: '/api/release-notes' })).statusCode).toBe(401);
  } finally {
    await close();
  }
});

it('returns release feed as JSON only to signed-in users', async () => {
  const request = vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValue({
    status: 200,
    body: '<feed><entry>example</entry></feed>',
  });
  const { app, cookie, close } = await createAppTestContext();
  try {
    expect((await app.inject({ method: 'GET', url: '/api/release-notes' })).statusCode).toBe(401);
    expect(request).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'GET',
      url: '/api/release-notes',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ feed: '<feed><entry>example</entry></feed>', demo: false });
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await close();
    vi.restoreAllMocks();
  }
});

it('provides clearly marked sample notes without making a network request in development mode', async () => {
  const request = vi.spyOn(network, 'getAuthorizedResponse');
  const database = createDatabase(':memory:');
  const { auth, cookie } = createTestSession();
  const app = createApp(database.db, 5173, auth, undefined, [], undefined, {
    developmentMocks: true,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/release-notes',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      demo: true,
      feed: expect.stringContaining('Example release notes'),
    });
    expect(request).not.toHaveBeenCalled();
  } finally {
    await app.close();
    database.close();
    vi.restoreAllMocks();
  }
});

it('returns a generic error when the upstream feed fails', async () => {
  vi.spyOn(network, 'getAuthorizedResponse').mockRejectedValue(
    new Error('private upstream detail'),
  );
  const { app, cookie, close } = await createAppTestContext();
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/release-notes',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private upstream detail');
  } finally {
    await close();
    vi.restoreAllMocks();
  }
});
