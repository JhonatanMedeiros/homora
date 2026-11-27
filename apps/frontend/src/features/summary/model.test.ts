import { describe, expect, it } from 'vitest';
import { summaryKey, SUMMARY_BLOCKS, type SummaryDesktopItem } from '@homora/shared';
import {
  mediumWidth,
  moveTo,
  resize,
  resolveDesktop,
  resolvePhone,
  setHidden,
  step,
  type LayoutWidget,
} from './model';

const widgets: LayoutWidget[] = [
  { id: 1, size: 'normal' },
  { id: 2, size: 'wide' },
  { id: 3, size: 'normal' },
];
const keys = (items: Parameters<typeof summaryKey>[0][]) => items.map(summaryKey);

describe('default arrangement', () => {
  it('shows every block and widget, the first widgets beside latency and maintenance', () => {
    const items = resolveDesktop(null, widgets);
    expect(items).toHaveLength(SUMMARY_BLOCKS.length + widgets.length);
    expect(keys(items).slice(-5)).toEqual([
      'latency',
      'widget:1',
      'maintenance',
      'widget:2',
      'widget:3',
    ]);
    expect(items.every((item) => !item.hidden)).toBe(true);
    expect(items.find((item) => item.widgetId === 2)?.width).toBe(8);
  });

  it('has its own order on phones', () => {
    expect(keys(resolvePhone(null, widgets)).slice(0, 7)).toEqual([
      'pinned',
      'attention',
      'proposals',
      'status',
      'widget:1',
      'widget:2',
      'widget:3',
    ]);
  });
});

describe('saved arrangement', () => {
  const saved: SummaryDesktopItem[] = [
    { widgetId: 9, width: 4, height: 2, hidden: false },
    { block: 'latency', width: 12, height: 3, hidden: false },
    { block: 'pinned', width: 12, height: 1, hidden: true },
  ];

  it('keeps its order, drops what is gone and appends what is new', () => {
    const items = resolveDesktop(saved, widgets);
    expect(keys(items).slice(0, 2)).toEqual(['latency', 'pinned']);
    expect(keys(items)).not.toContain('widget:9');
    expect(keys(items)).toContain('widget:3');
    expect(keys(items)).toHaveLength(SUMMARY_BLOCKS.length + widgets.length);
    expect(items[1]?.hidden).toBe(true);
  });
});

describe('arranging', () => {
  const items = resolveDesktop(null, widgets);

  it('moves by place and ignores unknown or unchanged moves', () => {
    expect(keys(moveTo(items, 'hosts', 'pinned'))[0]).toBe('hosts');
    expect(moveTo(items, 'hosts', 'hosts')).toBe(items);
    expect(moveTo(items, 'nothing', 'pinned')).toBe(items);
  });

  it('steps over entries that are not on screen', () => {
    const hidden = setHidden(items, 'attention', true);
    const moved = step(hidden, 'services', -1);
    expect(keys(moved).slice(0, 3)).toEqual(['services', 'pinned', 'attention']);
    expect(step(moved, 'services', -1)).toBe(moved);
  });

  it('brings a hidden block back at the end', () => {
    const shown = setHidden(setHidden(items, 'pinned', true), 'pinned', false);
    expect(keys(shown).at(-1)).toBe('pinned');
    expect(shown.at(-1)?.hidden).toBe(false);
  });

  it('keeps sizes inside the limits of each block', () => {
    const size = (width: number, height: number) =>
      resize(items, 'attention', { width, height }, widgets).find(
        (item) => item.block === 'attention',
      );
    expect(size(1, 0)).toMatchObject({ width: 6, height: 2 });
    expect(size(99, 99)).toMatchObject({ width: 12, height: 12 });
    expect(size(7.6, 3.2)).toMatchObject({ width: 8, height: 3 });
    expect(resize(items, 'pinned', { width: 12, height: 1 }, widgets)).toEqual(items);
  });

  it('uses half or all of the width on medium screens', () => {
    expect([3, 6, 7, 12].map(mediumWidth)).toEqual([6, 6, 12, 12]);
  });
});
