import { describe, expect, it } from 'vitest';
import { resolveCheckTarget } from './target.js';
import { serviceSignature } from './signature.js';

const card = {
  url: 'https://public.example/card',
  checkUrl: 'http://192.168.1.10/health',
  checkPath: '/old',
  checkType: 'http' as const,
  allowPrivate: true,
};

describe('monitor target and signature', () => {
  it('prefers the explicit target, including for probes', () => {
    expect(resolveCheckTarget(card)).toBe(card.checkUrl);
    expect(resolveCheckTarget({ ...card, url: null })).toBe(card.checkUrl);
  });
  it('resolves paths against the link origin only for applicable types', () => {
    expect(resolveCheckTarget({ ...card, checkUrl: null })).toBe('https://public.example/old');
    expect(resolveCheckTarget({ ...card, checkUrl: null, checkType: 'tls' })).toBe(card.url);
    expect(() => resolveCheckTarget({ ...card, url: null, checkUrl: null })).toThrow();
  });
  it('signs the effective target and relevant settings', () => {
    const original = serviceSignature(card);
    expect(
      serviceSignature({ ...card, url: 'https://other.example/', checkPath: '/ignored' }),
    ).toBe(original);
    expect(serviceSignature({ ...card, checkUrl: 'http://192.168.1.11/health' })).not.toBe(
      original,
    );
    expect(serviceSignature({ ...card, checkInterval: 60 })).not.toBe(original);
    expect(serviceSignature({ ...card, checkType: 'tcp' })).not.toBe(original);
    expect(serviceSignature({ ...card, checkInsecure: true })).not.toBe(original);
    const pathCard = { ...card, checkUrl: null };
    expect(serviceSignature({ ...pathCard, checkPath: '/new' })).not.toBe(
      serviceSignature(pathCard),
    );
    expect(serviceSignature({ ...pathCard, url: 'https://other.example/' })).not.toBe(
      serviceSignature(pathCard),
    );
  });
});
