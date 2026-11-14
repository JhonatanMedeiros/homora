import { describe, expect, it } from 'vitest';
import { ProbeValidationError, validateProbe } from './probes.js';

const code = (input: Parameters<typeof validateProbe>[0]) => {
  try {
    validateProbe(input);
  } catch (error) {
    return error instanceof ProbeValidationError ? error.code : 'other';
  }
  return 'valid';
};

describe('validateProbe', () => {
  it('fills defaults and keeps one spelling of the address', () => {
    expect(validateProbe({ name: ' WAN ', address: 'http://1.1.1.1/' })).toEqual({
      name: 'WAN',
      address: 'http://1.1.1.1',
      checkType: 'http',
      checkInterval: null,
      expectedStatus: null,
      checkMatch: null,
      allowPrivate: false,
    });
    expect(validateProbe({ name: 'x', address: 'https://host.lan:8443/health' }).address).toBe(
      'https://host.lan:8443/health',
    );
  });

  it('names what is wrong', () => {
    expect(code({ name: '', address: 'http://a' })).toBe('invalid-name');
    expect(code({ name: 'a'.repeat(81), address: 'http://a' })).toBe('invalid-name');
    expect(code({ name: 'x', address: 'tcp://a:1' })).toBe('invalid-address');
    expect(code({ name: 'x', address: 'http://a?x=1' })).toBe('invalid-address');
    expect(code({ name: 'x', address: 'http://a', checkInterval: 29 })).toBe('invalid-option');
    expect(code({ name: 'x', address: 'http://a', expectedStatus: '999' })).toBe('invalid-option');
    expect(code({ name: 'x', address: 'http://a', checkMatch: '' })).toBe('invalid-option');
    expect(code({ name: 'x', address: 'http://a', checkInterval: 30, checkType: 'tcp' })).toBe(
      'valid',
    );
  });
});
