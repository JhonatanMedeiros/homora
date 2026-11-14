import { describe, expect, it } from 'vitest';
import {
  linkLabel,
  linkOpenTarget,
  normalizeLinkTypeName,
  normalizeLinkUrl,
  sameLinkTypeName,
  validateServiceLinks,
} from './index.js';

describe('normalizeLinkUrl', () => {
  it('accepts http and https and normalizes', () => {
    expect(normalizeLinkUrl(' http://192.168.1.5:3000 ')).toBe('http://192.168.1.5:3000/');
    expect(normalizeLinkUrl('https://a.example/x?y=1')).toBe('https://a.example/x?y=1');
  });
  it.each(['javascript:alert(1)', 'ftp://x.example', 'http://u:p@host', 'nope', '', 42, null])(
    'rejects %s',
    (value) => expect(normalizeLinkUrl(value)).toBeNull(),
  );
  it('rejects addresses over the length limit', () => {
    expect(normalizeLinkUrl(`https://a.example/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('normalizeLinkTypeName', () => {
  it('trims and collapses spaces, 1 to 24 characters', () => {
    expect(normalizeLinkTypeName('  Rede   local ')).toBe('Rede local');
    expect(normalizeLinkTypeName('')).toBeNull();
    expect(normalizeLinkTypeName('x'.repeat(25))).toBeNull();
    expect(normalizeLinkTypeName('a\u0007b')).toBeNull();
    expect(normalizeLinkTypeName(3)).toBeNull();
  });
  it('compares names ignoring case', () => expect(sameLinkTypeName('LAN', 'lan')).toBe(true));
});

describe('validateServiceLinks', () => {
  it('normalizes items and keeps order and duplicates', () => {
    expect(
      validateServiceLinks([
        { url: 'http://192.168.1.5' },
        { url: 'http://192.168.1.5', name: ' IP ', typeId: 2, openTarget: 'same-tab' },
      ]),
    ).toEqual([
      { url: 'http://192.168.1.5/', name: '', typeId: null, openTarget: null },
      { url: 'http://192.168.1.5/', name: 'IP', typeId: 2, openTarget: 'same-tab' },
    ]);
  });
  it('accepts an empty list', () => expect(validateServiceLinks([])).toEqual([]));
  it.each([
    ['not a list', 'x'],
    ['too many', Array.from({ length: 11 }, () => ({ url: 'http://a.example' }))],
    ['bad url', [{ url: 'file:///etc/passwd' }]],
    ['credentials', [{ url: 'http://u:p@a.example' }]],
    ['name too long', [{ url: 'http://a.example', name: 'x'.repeat(81) }]],
    ['bad type id', [{ url: 'http://a.example', typeId: 'x' }]],
    ['bad target', [{ url: 'http://a.example', openTarget: 'popup' }]],
    ['item not an object', ['http://a.example']],
  ])('rejects the whole list: %s', (_name, input) =>
    expect(validateServiceLinks(input)).toBeNull(),
  );
});

describe('labels and targets', () => {
  const type = { id: 1, name: 'LAN', color: 'green' as const };
  it('names a link by its own name, its type, or its host', () => {
    expect(linkLabel({ name: 'IP direto', url: 'http://a.example', type })).toBe('IP direto');
    expect(linkLabel({ name: '', url: 'http://a.example', type })).toBe('LAN');
    expect(linkLabel({ name: '', url: 'http://a.example:8080/x', type: null })).toBe(
      'a.example:8080',
    );
  });
  it('opens with the link choice, else the service choice, else a new tab', () => {
    expect(linkOpenTarget({ openTarget: 'same-tab' }, { openTarget: 'new-tab' })).toBe('new-tab');
    expect(linkOpenTarget({ openTarget: 'same-tab' }, { openTarget: null })).toBe('same-tab');
    expect(linkOpenTarget({}, { openTarget: null })).toBe('new-tab');
  });
});
