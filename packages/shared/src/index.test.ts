import { describe, expect, it } from 'vitest';
import { normalizeIcon, validateService } from './index.js';
describe('validateService', () => {
  it('normalizes a valid service', () => {
    expect(
      validateService({
        name: ' Jellyfin ',
        category: ' Media ',
        url: 'http://localhost:8096',
        description: ' Movies ',
      }),
    ).toEqual({
      name: 'Jellyfin',
      category: 'Media',
      url: 'http://localhost:8096/',
      description: 'Movies',
      icon: '',
      position: 0,
      allowPrivate: false,
    });
  });
  it.each(['javascript:alert(1)', 'http://user:pass@localhost', 'invalid'])(
    'rejects invalid URL: %s',
    (url) => {
      expect(() => validateService({ name: 'Test', category: 'Home', url })).toThrow();
    },
  );
  it('rejects missing required fields', () => {
    expect(() =>
      validateService({ name: '', category: 'Home', url: 'http://localhost' }),
    ).toThrow();
  });
});

describe('normalizeIcon', () => {
  it('keeps emoji and short text, truncating at eight characters', () => {
    expect(normalizeIcon(' 🎬 ')).toBe('🎬');
    expect(normalizeIcon('brand:proxmox')).toBe('brand:proxmox');
    expect(normalizeIcon('brand:nao-existe')).toBe('');
    expect(normalizeIcon('brand:../x')).toBe('');
    expect(normalizeIcon('abcdefghij')).toBe('abcdefgh');
    expect(normalizeIcon(undefined)).toBe('');
  });
  it('accepts built-in icons by name', () => {
    expect(normalizeIcon('lucide:server')).toBe('lucide:server');
    expect(normalizeIcon('lucide:hard-drive')).toBe('lucide:hard-drive');
  });
  it.each(['lucide:', 'lucide:Server', 'lucide:a b', 'lucide:../x', 'lucide:a--b'])(
    'discards invalid icon name: %s',
    (value) => expect(normalizeIcon(value)).toBe(''),
  );
  it('accepts http(s) URL without credentials and normalizes', () => {
    expect(normalizeIcon('https://example.test/icons/a.png')).toBe(
      'https://example.test/icons/a.png',
    );
    expect(normalizeIcon('http://192.168.1.2/a.svg')).toBe('http://192.168.1.2/a.svg');
  });
  it.each([
    'https://user:pass@example.test/a.png',
    'https://',
    `https://example.test/${'a'.repeat(600)}`,
  ])('discards invalid, credentialed or overlong URL: %.40s', (value) =>
    expect(normalizeIcon(value)).toBe(''),
  );
  it('does not accept dangerous schemes as URL', () => {
    expect(normalizeIcon('javascript:alert(1)')).toBe('javascri');
    expect(normalizeIcon('data:image/svg+xml,<svg/>')).toBe('data:ima');
  });
});
