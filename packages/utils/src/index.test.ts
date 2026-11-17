import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  blend,
  contrastRatio,
  getOwnPath,
  hasControlChars,
  hexToRgb,
  hostOf,
  isHexColor,
  isHttpUrl,
  isPrivateHost,
  isRecord,
  isTimeZone,
  listTimeZones,
  parseHttpUrl,
  relativeLuminance,
  rgbToHex,
  sameUrl,
  splitDurationMs,
  textDiff,
} from './index.js';
import { isValidCaPem } from './node.js';

describe('@homora/utils', () => {
  it('detects ASCII control characters', () => {
    expect(hasControlChars('hello world')).toBe(false);
    expect(hasControlChars('hello\nworld')).toBe(true);
    expect(hasControlChars('hello\u0000world')).toBe(true);
    expect(hasControlChars('hello\x7Fworld')).toBe(true);
  });

  it('computes textDiff only when at least 3 characters are shared', () => {
    expect(textDiff('', 'abc')).toBeNull();
    expect(textDiff('same', 'same')).toBeNull();
    expect(textDiff('ab', 'ac')).toBeNull();
    expect(textDiff('http://nas.lan:8080', 'https://nas.lan:8080')).toEqual({
      prefix: 'http',
      before: '',
      after: 's',
      suffix: '://nas.lan:8080',
    });
  });

  it('validates records and traverses own properties safely', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);

    const payload = { a: [{ b: 42 }] };
    expect(getOwnPath(payload, ['a', 0, 'b'])).toBe(42);
    expect(getOwnPath(payload, ['a', '0', 'b'])).toBeUndefined();
    expect(getOwnPath(payload, ['a', '0', 'b'], { allowNumericArrayKeys: true })).toBe(42);
    expect(getOwnPath(payload, ['a', 1, 'b'])).toBeUndefined();
    expect(getOwnPath(payload, ['toString'])).toBeUndefined();
    expect(getOwnPath(payload, ['a', 0, 'constructor'])).toBeUndefined();
  });

  it('parses and compares HTTP(S) URLs and private hosts', () => {
    expect(isHttpUrl('https://example.com:8443/path')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isHttpUrl('https://example.com', 10)).toBe(false);

    expect(
      parseHttpUrl('https://homelab.local/', {
        httpsOnly: true,
        allowPath: false,
        allowQuery: false,
        allowHash: false,
      })?.origin,
    ).toBe('https://homelab.local');
    expect(parseHttpUrl('http://homelab.local/', { httpsOnly: true })).toBeNull();
    expect(parseHttpUrl('https://homelab.local/api', { allowPath: false })).toBeNull();

    expect(hostOf('https://example.com:8080/a')).toBe('example.com:8080');
    expect(hostOf('not-a-url')).toBe('not-a-url');

    expect(sameUrl('https://Example.com/app/', 'https://example.com:443/app')).toBe(true);
    expect(sameUrl('https://example.com/a', 'https://example.com/b')).toBe(false);
    expect(sameUrl(null, 'https://example.com')).toBe(false);

    expect(isPrivateHost('http://localhost:3000')).toBe(true);
    expect(isPrivateHost('http://192.168.1.10')).toBe(true);
    expect(isPrivateHost('http://172.16.0.1')).toBe(true);
    expect(isPrivateHost('http://172.32.0.1')).toBe(false);
    expect(isPrivateHost('https://example.com')).toBe(false);
  });

  it('handles WCAG color maths', () => {
    expect(isHexColor('#ff00aa')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(rgbToHex([255, 16, 0])).toBe('#ff1000');
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(blend([255, 0, 0], [0, 0, 255], 0.5)).toEqual([127.5, 0, 127.5]);
  });

  it('decomposes durations and validates time zones', () => {
    expect(splitDurationMs(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(splitDurationMs(-100)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Invalid/Zone')).toBe(false);
    expect(listTimeZones()).toContain('UTC');
  });

  it('rejects invalid PEM CA certificates in node helper', () => {
    expect(isValidCaPem('not-a-cert')).toBe(false);
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(isValidCaPem(publicKey.export({ type: 'spki', format: 'pem' }).toString())).toBe(false);
  });
});
