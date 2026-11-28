import { describe, expect, it } from 'vitest';
import { parseSummaryLayout, SUMMARY_MAX_ITEMS } from './summary-layout.js';

const item = { widgetId: 3, width: 8, height: 5 };

describe('parseSummaryLayout', () => {
  it('accepts default parts, saved widgets and widgets still to be created', () => {
    expect(parseSummaryLayout({ desktop: null, phone: null })).toEqual({
      desktop: null,
      phone: null,
    });
    const layout = {
      desktop: [item, { widgetId: -1, width: 4, height: 2 }],
      phone: [{ widgetId: -1 }, { widgetId: 3 }],
    };
    expect(parseSummaryLayout(layout)).toEqual(layout);
  });

  it.each([
    ['no widget', { width: 4, height: 2 }],
    ['widget zero', { ...item, widgetId: 0 }],
    ['a fractional widget', { ...item, widgetId: 1.5 }],
    ['an extra field', { ...item, hidden: true }],
    ['more columns than the grid', { ...item, width: 13 }],
    ['a height of zero', { ...item, height: 0 }],
    ['a fraction', { ...item, width: 8.5 }],
    ['a missing size', { widgetId: 3 }],
  ])('rejects %s', (_name, entry) => {
    expect(parseSummaryLayout({ desktop: [entry], phone: null })).toBeNull();
  });

  it('rejects repeated entries, sizes on phones, long lists and other shapes', () => {
    expect(parseSummaryLayout({ desktop: [item, item], phone: null })).toBeNull();
    expect(parseSummaryLayout({ desktop: null, phone: [item] })).toBeNull();
    const many = Array.from({ length: SUMMARY_MAX_ITEMS + 1 }, (_, index) => ({
      widgetId: index + 1,
    }));
    expect(parseSummaryLayout({ desktop: null, phone: many })).toBeNull();
    for (const value of [null, [], 'x', { desktop: null }, { desktop: {}, phone: null }])
      expect(parseSummaryLayout(value)).toBeNull();
  });
});
