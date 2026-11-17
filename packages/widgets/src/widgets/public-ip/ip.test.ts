import { describe, expect, it } from 'vitest';
import { maskIpAddress, normalizeIpv4, normalizeIpv6 } from './ip.js';

describe('public-ip address validation and normalization', () => {
  it('validates and normalizes IPv4 addresses', () => {
    expect(normalizeIpv4('203.0.113.42')).toBe('203.0.113.42');
    expect(normalizeIpv4(' 198.51.100.0\n')).toBe('198.51.100.0');
    expect(normalizeIpv4('0.0.0.0')).toBe('0.0.0.0');

    expect(normalizeIpv4('01.0.0.1')).toBeNull();
    expect(normalizeIpv4('256.0.0.1')).toBeNull();
    expect(normalizeIpv4('1.2.3')).toBeNull();
    expect(normalizeIpv4('1.2.3.4.5')).toBeNull();
    expect(normalizeIpv4('2001:db8::1')).toBeNull();
    expect(normalizeIpv4('')).toBeNull();
  });

  it('validates and normalizes IPv6 addresses to RFC 5952 canonical form', () => {
    expect(normalizeIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('2001:db8::ff00:42:8329');
    expect(normalizeIpv6('2001:0DB8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(normalizeIpv6(' 0:0:0:0:0:0:0:1\n')).toBe('::1');
    expect(normalizeIpv6('::')).toBe('::');
    expect(normalizeIpv6('::ffff:192.0.2.1')).toBe('::ffff:c000:201');

    expect(normalizeIpv6('fe80::1%eth0')).toBeNull();
    expect(normalizeIpv6('[2001:db8::1]')).toBeNull();
    expect(normalizeIpv6('2001::db8::1')).toBeNull();
    expect(normalizeIpv6('2001:db8:1:2:3:4:5:6:7')).toBeNull();
    expect(normalizeIpv6('2001:db8::gggg')).toBeNull();
    expect(normalizeIpv6('203.0.113.1')).toBeNull();
    expect(normalizeIpv6('')).toBeNull();
  });

  it('masks IPv4 and IPv6 addresses', () => {
    expect(maskIpAddress('ipv4')).toBe('•••.•••.•••.•••');
    expect(maskIpAddress('ipv6')).toBe('••••:••••:••••:••••');
  });
});
