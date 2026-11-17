import { describe, expect, it } from 'vitest';
import {
  RdapParseError,
  findRdapBaseUrl,
  parseRdapBootstrap,
  parseRdapDomainResponse,
} from './rdap.js';

describe('domain-expiry RDAP helpers', () => {
  it('parses IANA RDAP bootstrap JSON, ignores non-HTTPS URLs, and matches longest suffix', () => {
    const bootstrap = parseRdapBootstrap(
      JSON.stringify({
        version: '1.0',
        services: [
          [
            ['com', 'net'],
            ['http://insecure.example/rdap/', 'https://rdap.verisign.com/com/v1'],
          ],
          [['co.uk'], ['https://rdap.nominet.uk/co-uk/']],
          [['uk'], ['https://rdap.nominet.uk/uk/']],
        ],
      }),
    );

    expect(findRdapBaseUrl(bootstrap, 'example.com')).toBe('https://rdap.verisign.com/com/v1/');
    expect(findRdapBaseUrl(bootstrap, 'example.co.uk')).toBe('https://rdap.nominet.uk/co-uk/');
    expect(findRdapBaseUrl(bootstrap, 'example.uk')).toBe('https://rdap.nominet.uk/uk/');
    expect(findRdapBaseUrl(bootstrap, 'example.xyz')).toBeNull();
  });

  it('throws RdapParseError on malformed bootstrap JSON', () => {
    expect(() => parseRdapBootstrap('not-json')).toThrow(RdapParseError);
    expect(() => parseRdapBootstrap(JSON.stringify({}))).toThrow(RdapParseError);
  });

  it('extracts expiration event and returns null when expiration is missing', () => {
    const withExpiry = parseRdapDomainResponse(
      JSON.stringify({
        objectClassName: 'domain',
        events: [
          { eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' },
          { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
        ],
      }),
    );
    expect(withExpiry.expiresAt).toBe(Date.parse('2027-08-13T04:00:00Z'));

    const withoutExpiry = parseRdapDomainResponse(
      JSON.stringify({
        objectClassName: 'domain',
        events: [{ eventAction: 'last changed', eventDate: '2026-01-01T00:00:00Z' }],
      }),
    );
    expect(withoutExpiry.expiresAt).toBeNull();
    expect(() => parseRdapDomainResponse('{bad')).toThrow(RdapParseError);
  });
});
