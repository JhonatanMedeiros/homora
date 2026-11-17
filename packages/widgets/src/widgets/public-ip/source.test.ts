import { describe, expect, it, vi } from 'vitest';
import {
  SourceParseError,
  SourcePolicyBlockedError,
  type WidgetSourceContext,
} from '../../source.js';
import { publicIpSource } from './source.js';

describe('public-ip source reader', () => {
  it('validates query parameters and builds canonical cache keys', () => {
    expect(publicIpSource.parseQuery({})).toBeNull();
    expect(publicIpSource.parseQuery({ provider: 'unknown', addressFamily: 'ipv4' })).toBeNull();
    expect(publicIpSource.parseQuery({ provider: 'ipify', addressFamily: 'dual' })).toBeNull();

    const parsed = publicIpSource.parseQuery({ provider: 'icanhazip', addressFamily: 'both' });
    expect(parsed).toEqual({
      cacheKey: 'icanhazip\0both',
      params: { provider: 'icanhazip', addressFamily: 'both' },
    });
    expect(publicIpSource.cacheTtlMs).toBe(5 * 60 * 1000);
  });

  it('fetches ipify JSON endpoints with allowPrivate: false and normalizes IPv4/IPv6', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('api6.ipify.org')) {
        return {
          status: 200,
          body: JSON.stringify({ ip: '2001:0DB8:0000:0000:0000:0000:0000:0001' }),
        };
      }
      return { status: 200, body: JSON.stringify({ ip: '203.0.113.10' }) };
    });
    const ctx: WidgetSourceContext = { fetch, now: () => 12_345 };

    const v4 = await publicIpSource.read({ provider: 'ipify', addressFamily: 'ipv4' }, ctx);
    expect(fetch).toHaveBeenCalledWith('https://api.ipify.org?format=json', {
      allowPrivate: false,
      timeoutMs: 5000,
      maxBodyBytes: 4096,
      headers: { accept: 'application/json' },
    });
    expect(v4).toEqual({
      provider: 'ipify',
      addressFamily: 'ipv4',
      ipv4: '203.0.113.10',
      ipv6: null,
      ipv6Unavailable: false,
      fetchedAt: 12_345,
      stale: false,
    });

    const v6 = await publicIpSource.read({ provider: 'ipify', addressFamily: 'ipv6' }, ctx);
    expect(fetch).toHaveBeenCalledWith('https://api6.ipify.org?format=json', {
      allowPrivate: false,
      timeoutMs: 5000,
      maxBodyBytes: 4096,
      headers: { accept: 'application/json' },
    });
    expect(v6.ipv6).toBe('2001:db8::1');
  });

  it('fetches icanhazip text endpoints and handles IPv6 unavailability when both is selected', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === 'https://ipv6.icanhazip.com') {
        throw new Error('ENETUNREACH');
      }
      return { status: 200, body: '198.51.100.77\n' };
    });
    const ctx: WidgetSourceContext = { fetch, now: () => 50_000 };

    const both = await publicIpSource.read({ provider: 'icanhazip', addressFamily: 'both' }, ctx);
    expect(both).toEqual({
      provider: 'icanhazip',
      addressFamily: 'both',
      ipv4: '198.51.100.77',
      ipv6: null,
      ipv6Unavailable: true,
      fetchedAt: 50_000,
      stale: false,
    });
  });

  it('propagates SourcePolicyBlockedError and rejects invalid payloads', async () => {
    const policyCtx: WidgetSourceContext = {
      fetch: async () => {
        throw new SourcePolicyBlockedError('destination-disallowed');
      },
      now: () => 1000,
    };
    await expect(
      publicIpSource.read({ provider: 'ipify', addressFamily: 'both' }, policyCtx),
    ).rejects.toThrowError(SourcePolicyBlockedError);

    const badJsonCtx: WidgetSourceContext = {
      fetch: async () => ({ status: 200, body: 'not-json' }),
      now: () => 1000,
    };
    await expect(
      publicIpSource.read({ provider: 'ipify', addressFamily: 'ipv4' }, badJsonCtx),
    ).rejects.toThrowError(SourceParseError);

    const badIpCtx: WidgetSourceContext = {
      fetch: async () => ({ status: 200, body: '999.999.999.999' }),
      now: () => 1000,
    };
    await expect(
      publicIpSource.read({ provider: 'icanhazip', addressFamily: 'ipv4' }, badIpCtx),
    ).rejects.toThrowError(SourceParseError);

    const httpErrCtx: WidgetSourceContext = {
      fetch: async () => ({ status: 503, body: '' }),
      now: () => 1000,
    };
    await expect(
      publicIpSource.read({ provider: 'icanhazip', addressFamily: 'ipv4' }, httpErrCtx),
    ).rejects.toThrowError('HTTP 503');
  });
});
