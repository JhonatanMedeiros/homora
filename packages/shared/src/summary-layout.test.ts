import { describe, expect, it } from 'vitest';
import {
  parseSummaryLayout,
  SUMMARY_BLOCK_SIZES,
  SUMMARY_BLOCKS,
  SUMMARY_MAX_ITEMS,
  summaryKey,
} from './summary-layout.js';

const block = { block: 'attention', width: 8, height: 5, hidden: false };

describe('parseSummaryLayout', () => {
  it('accepts default parts and both kinds of entry', () => {
    expect(parseSummaryLayout({ desktop: null, phone: null })).toEqual({
      desktop: null,
      phone: null,
    });
    const layout = {
      desktop: [block, { widgetId: 3, width: 4, height: 2, hidden: true }],
      phone: [
        { widgetId: 3, hidden: false },
        { block: 'pinned', hidden: true },
      ],
    };
    expect(parseSummaryLayout(layout)).toEqual(layout);
  });

  it.each([
    ['an unknown block', { ...block, block: 'weather' }],
    ['no reference', { width: 4, height: 2, hidden: false }],
    ['two references', { ...block, widgetId: 1 }],
    ['an extra field', { ...block, color: 'red' }],
    ['a narrower block than it allows', { ...block, width: 5 }],
    ['more columns than the grid', { ...block, width: 13 }],
    ['a height of zero', { ...block, height: 0 }],
    ['a fraction', { ...block, width: 8.5 }],
    ['an invalid widget', { widgetId: 0, width: 4, height: 2, hidden: false }],
    ['a missing visibility', { block: 'pinned', width: 12, height: 1 }],
  ])('rejects %s', (_name, item) => {
    expect(parseSummaryLayout({ desktop: [item], phone: null })).toBeNull();
  });

  it('rejects repeated entries, sizes on phones, long lists and other shapes', () => {
    expect(parseSummaryLayout({ desktop: [block, block], phone: null })).toBeNull();
    expect(parseSummaryLayout({ desktop: null, phone: [block] })).toBeNull();
    const many = Array.from({ length: SUMMARY_MAX_ITEMS + 1 }, (_, index) => ({
      widgetId: index + 1,
      hidden: false,
    }));
    expect(parseSummaryLayout({ desktop: null, phone: many })).toBeNull();
    for (const value of [null, [], 'x', { desktop: null }, { desktop: {}, phone: null }])
      expect(parseSummaryLayout(value)).toBeNull();
  });

  it('keeps every default size inside its own limits', () => {
    for (const name of SUMMARY_BLOCKS) {
      const size = SUMMARY_BLOCK_SIZES[name];
      expect(
        parseSummaryLayout({
          desktop: [{ block: name, width: size.width, height: size.height, hidden: false }],
          phone: null,
        }),
      ).not.toBeNull();
      expect(summaryKey({ block: name })).toBe(name);
    }
    expect(summaryKey({ widgetId: 4 })).toBe('widget:4');
  });
});
