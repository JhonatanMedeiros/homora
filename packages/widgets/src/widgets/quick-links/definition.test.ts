import { describe, expect, it } from 'vitest';
import { widgetQuickLinksWidget as widget } from './definition.js';

describe('quick links configuration', () => {
  it('accepts empty and bounded portable configurations', () => {
    expect(widget.parseConfig(widget.defaultConfig)).toEqual({ title: '', links: [] });
    const links = Array.from({ length: 12 }, (_, i) => ({
      label: `Link ${i}`,
      url: 'https://example.test/path',
    }));
    expect(widget.parseConfig({ title: ' Links ', links })).toEqual({ title: 'Links', links });
    expect(widget.parseConfig({ title: '', links: [...links, links[0]] })).toBeNull();
    expect(widget.portable).toBe(true);
    expect(widget.source).toBeNull();
  });
  it.each([
    '',
    'javascript:alert(1)',
    'data:text/html,x',
    'https://user:pass@example.test',
    'https://@example.test',
    'https://example.test/a b',
    'https:example.test',
    '//example.test',
  ])('rejects unsafe URL %s', (url) => {
    expect(widget.parseConfig({ title: '', links: [{ label: 'Link', url }] })).toBeNull();
  });
  it('rejects malformed configuration and blank labels', () => {
    expect(widget.parseConfig(null)).toBeNull();
    expect(
      widget.parseConfig({ title: '', links: [{ label: ' ', url: 'http://example.test' }] }),
    ).toBeNull();
    expect(widget.parseConfig({ title: '', links: [], extra: true })).toBeNull();
  });
});
