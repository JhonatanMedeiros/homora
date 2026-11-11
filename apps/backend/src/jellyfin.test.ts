import { expect, it, vi } from 'vitest';
import { createJellyfinAdapter } from './jellyfin.js';

it('rejects protocols, credentials and query parameters in URL', () => {
  const adapter = createJellyfinAdapter(vi.fn());
  for (const url of [
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://example.com/?key=secret',
  ])
    expect(() => adapter.validate({ url })).toThrow();
});

it('queries only the public API using injected transport', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: { ServerName: 'Server', Version: '10.10', Id: 'private' },
  }));
  const adapter = createJellyfinAdapter(transport);
  await expect(adapter.collect({ url: 'http://example.test/jellyfin/' })).resolves.toEqual({
    name: 'Server',
    version: '10.10',
  });
  expect(transport).toHaveBeenCalledWith({
    origin: 'http://example.test',
    path: '/jellyfin/System/Info/Public',
  });
});

it('sanitizes network error and rejects unexpected status and data', async () => {
  const failed = createJellyfinAdapter(async () => {
    throw new Error('private data');
  });
  await expect(failed.collect({ url: 'https://example.test' })).rejects.toThrow('Could not query');
  const redirect = createJellyfinAdapter(async () => ({ status: 302, body: null }));
  await expect(redirect.collect({ url: 'https://example.test' })).rejects.toThrow(
    'Invalid Jellyfin response',
  );
  const malformed = createJellyfinAdapter(async () => ({ status: 200, body: { ServerName: 42 } }));
  await expect(malformed.collect({ url: 'https://example.test' })).rejects.toThrow(
    'Invalid Jellyfin response',
  );
});
