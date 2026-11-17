import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcePolicyBlockedError, type WidgetSourceContext } from '../../source.js';
import { IANA_RDAP_BOOTSTRAP_URL } from './rdap.js';
import { clearRdapBootstrapCache, domainExpirySource } from './source.js';

afterEach(() => {
  clearRdapBootstrapCache();
});

const SAMPLE_BOOTSTRAP = JSON.stringify({
  version: '1.0',
  services: [
    [['com'], ['https://rdap.verisign.com/com/v1/']],
    [['org'], ['https://rdap.publicinterestregistry.org/rdap/']],
  ],
});

describe('domain-expiry source reader', () => {
  it('validates queries and builds canonical cache keys', () => {
    expect(domainExpirySource.parseQuery({})).toBeNull();
    expect(domainExpirySource.parseQuery({ domains: '192.168.1.1' })).toBeNull();
    expect(
      domainExpirySource.parseQuery({ domains: 'a.com,b.com,c.com,d.com,e.com,f.com' }),
    ).toBeNull();

    const parsed = domainExpirySource.parseQuery({ domains: 'Example.ORG, example.com' });
    expect(parsed).toEqual({
      cacheKey: 'example.com,example.org',
      params: { domains: ['example.org', 'example.com'] },
    });
  });

  it('caches IANA bootstrap and queries RDAP endpoints directly with allowPrivate: false', async () => {
    let now = 1_000_000;
    const fetchMock = vi.fn(async (destination: string) => {
      if (destination === IANA_RDAP_BOOTSTRAP_URL) {
        return { status: 200, body: SAMPLE_BOOTSTRAP };
      }
      if (destination === 'https://rdap.verisign.com/com/v1/domain/example.com') {
        return {
          status: 200,
          body: JSON.stringify({
            events: [{ eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' }],
          }),
        };
      }
      if (destination === 'https://rdap.publicinterestregistry.org/rdap/domain/missing-date.org') {
        return {
          status: 200,
          body: JSON.stringify({ events: [] }),
        };
      }
      return { status: 404, body: '{}' };
    });

    const context: WidgetSourceContext = {
      fetch: fetchMock,
      now: () => now,
    };

    const result = await domainExpirySource.read(
      { domains: ['example.com', 'missing-date.org', 'unknown.xyz'] },
      context,
    );

    expect(result.stale).toBe(false);
    expect(result.domains).toEqual([
      {
        domain: 'example.com',
        status: 'ok',
        expiresAt: Date.parse('2027-08-13T04:00:00Z'),
      },
      { domain: 'missing-date.org', status: 'unknown', expiresAt: null },
      { domain: 'unknown.xyz', status: 'unknown', expiresAt: null },
    ]);

    for (const call of fetchMock.mock.calls) {
      expect((call[1] as { allowPrivate: boolean } | undefined)?.allowPrivate).toBe(false);
    }

    // Second read within 24h reuses cached IANA bootstrap.
    now += 60_000;
    await domainExpirySource.read({ domains: ['example.com'] }, context);
    const bootstrapCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === IANA_RDAP_BOOTSTRAP_URL,
    );
    expect(bootstrapCalls).toHaveLength(1);
  });

  it('isolates per-domain errors while throwing when all domains fail', async () => {
    const partialFetch = vi.fn(async (destination: string) => {
      if (destination === IANA_RDAP_BOOTSTRAP_URL) {
        return { status: 200, body: SAMPLE_BOOTSTRAP };
      }
      if (destination.endsWith('/example.com')) {
        return {
          status: 200,
          body: JSON.stringify({
            events: [{ eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' }],
          }),
        };
      }
      return { status: 503, body: 'unavailable' };
    });

    const partial = await domainExpirySource.read(
      { domains: ['example.com', 'failing.com'] },
      { fetch: partialFetch, now: () => 1000 },
    );
    expect(partial.domains).toEqual([
      { domain: 'example.com', status: 'ok', expiresAt: Date.parse('2027-08-13T04:00:00Z') },
      { domain: 'failing.com', status: 'error', expiresAt: null },
    ]);

    const allFailFetch = vi.fn(async (destination: string) => {
      if (destination === IANA_RDAP_BOOTSTRAP_URL) {
        return { status: 200, body: SAMPLE_BOOTSTRAP };
      }
      return { status: 500, body: 'error' };
    });

    await expect(
      domainExpirySource.read(
        { domains: ['failing.com'] },
        { fetch: allFailFetch, now: () => 1000 },
      ),
    ).rejects.toThrow('All RDAP domain lookups failed.');
  });

  it('propagates SourcePolicyBlockedError when blocked by network policy', async () => {
    const blockedFetch = vi.fn(async () => {
      throw new SourcePolicyBlockedError('destination-disallowed');
    });

    await expect(
      domainExpirySource.read(
        { domains: ['example.com'] },
        { fetch: blockedFetch, now: () => 1000 },
      ),
    ).rejects.toBeInstanceOf(SourcePolicyBlockedError);
  });
});
