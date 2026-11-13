import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { parsePasskeyRpId, resolvePasskeyConfig } from './passkey-config.js';

describe('passkey relying party configuration', () => {
  it('defaults to localhost and the web port, ignoring other origins', () => {
    expect(
      resolvePasskeyConfig({ webPort: 5173, allowedOrigins: ['https://homora.example.home'] }),
    ).toEqual({ rpId: 'localhost', origins: ['http://localhost:5173'] });
  });

  it('binds to a domain only through explicit HTTPS origins under it', () => {
    expect(
      resolvePasskeyConfig({
        webPort: 5173,
        rpId: 'example.home',
        allowedOrigins: [
          'https://homora.example.home',
          'https://other.test',
          'http://localhost:5173',
        ],
      }),
    ).toEqual({ rpId: 'example.home', origins: ['https://homora.example.home'] });
    expect(() =>
      resolvePasskeyConfig({ webPort: 5173, rpId: 'example.home', allowedOrigins: [] }),
    ).toThrow(/HTTPS origin/);
    // A domain that merely ends with the same letters is not under it.
    expect(() =>
      resolvePasskeyConfig({
        webPort: 5173,
        rpId: 'example.home',
        allowedOrigins: ['https://badexample.home'],
      }),
    ).toThrow();
  });

  it('rejects addresses, ports and schemes as RP ID', () => {
    for (const value of [
      '192.168.1.10',
      'https://example.home',
      'example.home:8443',
      'Example.Home',
    ])
      expect(() => parsePasskeyRpId(value)).toThrow();
    expect(parsePasskeyRpId('')).toBeUndefined();
    expect(parsePasskeyRpId(' example.home ')).toBe('example.home');
  });

  it('fails startup when the RP ID has no matching origin', () => {
    expect(() => loadConfig({ HOMORA_PASSKEY_RP_ID: 'example.home' })).toThrow(/HTTPS origin/);
    expect(
      loadConfig({
        HOMORA_PASSKEY_RP_ID: 'example.home',
        HOMORA_ALLOWED_ORIGINS: 'https://homora.example.home',
      }).passkeyRpId,
    ).toBe('example.home');
    expect(loadConfig({}).passkeyRpId).toBeUndefined();
  });
});
