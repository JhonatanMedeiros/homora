import { expect, it, vi } from 'vitest';
import { createPiHoleAdapter } from './backend.js';
import { createPiHolePresentation } from './frontend.js';
const summary = {
  queries: { total: 10, blocked: 2, percent_blocked: 20 },
  gravity: { domains_being_blocked: 100 },
};
const config = { url: 'https://pihole.example.test', secret: 'app-password' };
it('reads blocking state and represents an unavailable status as unknown', async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce({ status: 200, body: summary })
    .mockResolvedValueOnce({ status: 200, body: { blocking: 'disabled' } });
  const adapter = createPiHoleAdapter(transport, (code) => new Error(code));
  const data = await adapter.collect(config);
  expect(data.blocking).toBe('disabled');
  expect(transport.mock.calls[1]?.[0].path).toBe('/api/dns/blocking');
  expect(
    createPiHolePresentation((key) => key)
      .stats(data)
      ?.at(-1),
  ).toEqual({ label: 'pihole.protection', value: 'pihole.disabled' });
  transport
    .mockResolvedValueOnce({ status: 200, body: summary })
    .mockRejectedValueOnce(new Error('unreachable'));
  expect((await adapter.collect(config)).blocking).toBe('unknown');
});
