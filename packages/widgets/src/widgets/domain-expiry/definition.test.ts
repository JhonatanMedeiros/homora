import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WARN_DAYS,
  MAX_DOMAINS,
  defaultDomainExpiryConfig,
  parsePublicDomain,
  widgetDomainExpiryWidget,
} from './definition.js';

describe('domain-expiry widget definition', () => {
  it('exposes expected metadata and defaults', () => {
    expect(widgetDomainExpiryWidget.type).toBe('domain-expiry');
    expect(widgetDomainExpiryWidget.version).toBe(1);
    expect(widgetDomainExpiryWidget.locations).toEqual(['page']);
    expect(widgetDomainExpiryWidget.sizes).toEqual(['normal', 'wide']);
    expect(widgetDomainExpiryWidget.portable).toBe(true);
    expect(defaultDomainExpiryConfig).toEqual({
      title: '',
      domains: [],
      warnDays: DEFAULT_WARN_DAYS,
    });
  });

  it('validates and normalizes public domains strictly', () => {
    expect(parsePublicDomain('Example.COM')).toBe('example.com');
    expect(parsePublicDomain('  sub.domain.co.uk  ')).toBe('sub.domain.co.uk');
    expect(parsePublicDomain('münchen.de')).toBe('xn--mnchen-3ya.de');

    expect(parsePublicDomain('')).toBeNull();
    expect(parsePublicDomain('localhost')).toBeNull();
    expect(parsePublicDomain('nas.local')).toBeNull();
    expect(parsePublicDomain('router.internal')).toBeNull();
    expect(parsePublicDomain('192.168.1.1')).toBeNull();
    expect(parsePublicDomain('127.0.0.1')).toBeNull();
    expect(parsePublicDomain('2130706433')).toBeNull();
    expect(parsePublicDomain('[::1]')).toBeNull();
    expect(parsePublicDomain('example.com:443')).toBeNull();
    expect(parsePublicDomain('https://example.com')).toBeNull();
    expect(parsePublicDomain('example.com/path')).toBeNull();
    expect(parsePublicDomain('user@example.com')).toBeNull();
    expect(parsePublicDomain('-bad.com')).toBeNull();
    expect(parsePublicDomain('.example.com')).toBeNull();
    expect(parsePublicDomain('example.com.')).toBeNull();
  });

  it('accepts valid configurations and rejects invalid ones', () => {
    expect(
      widgetDomainExpiryWidget.parseConfig({
        title: '  My Domains  ',
        domains: ['Example.COM', 'example.org', 'example.com'],
        warnDays: 14,
      }),
    ).toEqual({
      title: 'My Domains',
      domains: ['example.com', 'example.org'],
      warnDays: 14,
    });

    expect(widgetDomainExpiryWidget.parseConfig(defaultDomainExpiryConfig)).toBeNull();
    expect(widgetDomainExpiryWidget.parseConfig(null)).toBeNull();
    expect(
      widgetDomainExpiryWidget.parseConfig({
        domains: ['example.com'],
        warnDays: 30,
        extra: true,
      }),
    ).toBeNull();
    expect(
      widgetDomainExpiryWidget.parseConfig({
        domains: Array.from({ length: MAX_DOMAINS + 1 }, (_, i) => `d${i}.com`),
        warnDays: 30,
      }),
    ).toBeNull();
    expect(
      widgetDomainExpiryWidget.parseConfig({
        domains: ['192.168.1.1'],
        warnDays: 30,
      }),
    ).toBeNull();
    expect(
      widgetDomainExpiryWidget.parseConfig({
        domains: ['example.com'],
        warnDays: 0,
      }),
    ).toBeNull();
    expect(
      widgetDomainExpiryWidget.parseConfig({
        domains: ['example.com'],
        warnDays: 366,
      }),
    ).toBeNull();
  });
});
