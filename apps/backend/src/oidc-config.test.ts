import { describe, expect, it } from 'vitest';
import { oidcProviderId, parseOidcConfig } from './oidc-config.js';

const base = {
  HOMORA_OIDC_ISSUER: 'https://idp.example.test/application/o/homora/',
  HOMORA_OIDC_CLIENT_ID: 'homora',
  HOMORA_OIDC_CLIENT_SECRET: 'secret',
};
const parse = (env: Record<string, string>, allowedOrigins: string[] = []) =>
  parseOidcConfig(env, { webPort: 5173, allowedOrigins });

describe('OIDC configuration', () => {
  it('is off without an issuer, and a partial configuration fails loudly', () => {
    expect(parse({})).toBeUndefined();
    expect(parse({ HOMORA_OIDC_ISSUER: '  ' })).toBeUndefined();
    expect(() => parse({ HOMORA_OIDC_CLIENT_ID: 'homora' })).toThrow(
      /HOMORA_OIDC_ISSUER is required/,
    );
  });

  it('reads the provider, keeping the issuer exactly as written', () => {
    expect(parse(base)).toEqual({
      issuer: 'https://idp.example.test/application/o/homora/',
      clientId: 'homora',
      clientSecret: 'secret',
      name: 'OpenID Connect',
      redirectOrigin: 'http://localhost:5173',
    });
    expect(parse({ ...base, HOMORA_OIDC_ISSUER: 'https://idp.example.test' })?.issuer).toBe(
      'https://idp.example.test',
    );
  });

  it('prefers the first HTTPS allowed origin and accepts only configured origins', () => {
    expect(parse(base, ['https://homora.example.test'])?.redirectOrigin).toBe(
      'https://homora.example.test',
    );
    expect(
      parse({ ...base, HOMORA_OIDC_REDIRECT_ORIGIN: 'http://127.0.0.1:5173' })?.redirectOrigin,
    ).toBe('http://127.0.0.1:5173');
    expect(() =>
      parse({ ...base, HOMORA_OIDC_REDIRECT_ORIGIN: 'https://other.example.test' }),
    ).toThrow(/REDIRECT_ORIGIN/);
  });

  it.each([
    ['plain HTTP issuer', { HOMORA_OIDC_ISSUER: 'http://idp.example.test' }],
    ['issuer with credentials', { HOMORA_OIDC_ISSUER: 'https://user:pass@idp.example.test' }],
    ['issuer with a query', { HOMORA_OIDC_ISSUER: 'https://idp.example.test/?a=1' }],
    ['issuer that is not a URL', { HOMORA_OIDC_ISSUER: 'idp.example.test' }],
    ['missing client id', { HOMORA_OIDC_CLIENT_ID: '' }],
    ['missing client secret', { HOMORA_OIDC_CLIENT_SECRET: '' }],
    ['markup in the label', { HOMORA_OIDC_NAME: '<b>x</b>' }],
    ['long label', { HOMORA_OIDC_NAME: 'x'.repeat(41) }],
  ])('rejects %s', (_name, override) => {
    expect(() => parse({ ...base, ...override })).toThrow();
  });

  it('never repeats the secret in an error', () => {
    try {
      parse({
        ...base,
        HOMORA_OIDC_ISSUER: 'http://idp.example.test',
        HOMORA_OIDC_CLIENT_SECRET: 'super-secret-value',
      });
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });

  it('derives the provider id from the issuer, so another issuer never matches', () => {
    expect(oidcProviderId('https://a.example.test/')).toMatch(/^oidc-[0-9a-f]{16}$/);
    expect(oidcProviderId('https://a.example.test/')).toBe(
      oidcProviderId('https://a.example.test/'),
    );
    expect(oidcProviderId('https://a.example.test/')).not.toBe(
      oidcProviderId('https://b.example.test/'),
    );
  });
});
