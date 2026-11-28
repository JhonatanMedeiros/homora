import { describe, expect, it } from 'vitest';
import { summaryWidgetTypes } from '@homora/widgets/summary';
import {
  limitsOf,
  mediumWidth,
  moveTo,
  resize,
  resolveDesktop,
  resolvePhone,
  step,
  type LayoutWidget,
} from './model';

const own: LayoutWidget[] = summaryWidgetTypes.map((type, index) => ({
  id: index + 1,
  type,
  size: 'normal',
}));
const added: LayoutWidget[] = [
  { id: 100, type: 'clock', size: 'normal' },
  { id: 101, type: 'note', size: 'wide' },
  { id: 102, type: 'clock', size: 'normal' },
];
const idOf = (type: string) => own.find((widget) => widget.type === type)!.id;
const ids = (items: { widgetId: number }[]) => items.map((item) => item.widgetId);

describe('default arrangements', () => {
  it('reads the Summary in its order, with added widgets beside latency and maintenance', () => {
    const items = resolveDesktop(null, [...added, ...[...own].reverse()]);
    const order = ids(items);
    expect(order[0]).toBe(idOf('summary-pinned'));
    expect(order.indexOf(100)).toBe(order.indexOf(idOf('summary-latency')) + 1);
    expect(order.indexOf(101)).toBe(order.indexOf(idOf('summary-maintenance')) + 1);
    expect(order.at(-1)).toBe(102);
    expect(items.find((item) => item.widgetId === 101)).toMatchObject({ width: 8 });
    expect(order).toHaveLength(own.length + added.length);
  });

  it('puts what needs attention first on phones, then the added widgets', () => {
    const order = ids(resolvePhone(null, [...added, ...own]));
    expect(order.slice(0, 2)).toEqual([idOf('summary-pinned'), idOf('summary-attention')]);
    expect(order.indexOf(100)).toBe(order.indexOf(idOf('summary-status')) + 1);
    expect(order.at(-1)).toBe(idOf('summary-probes'));
  });

  it('copes with removed and repeated widgets', () => {
    const some: LayoutWidget[] = [own[1]!, { ...own[1]!, id: 200 }, added[0]!];
    expect(ids(resolveDesktop(null, some))).toEqual([2, 200, 100]);
  });
});

describe('saved arrangements', () => {
  it('keeps the saved order, drops widgets that are gone and appends new ones', () => {
    const saved = [
      { widgetId: 100, width: 6, height: 3 },
      { widgetId: 999, width: 4, height: 2 },
      { widgetId: 2, width: 12, height: 4 },
    ];
    const items = resolveDesktop(saved, [own[0]!, own[1]!, added[0]!]);
    expect(ids(items)).toEqual([100, 2, 1]);
    expect(items[0]).toEqual(saved[0]);
  });
});

describe('editing', () => {
  const items = resolveDesktop(null, own);

  it('moves to another place and one step, skipping widgets not on screen', () => {
    expect(ids(moveTo(items, 3, 1))[0]).toBe(3);
    expect(moveTo(items, 3, 999)).toBe(items);
    const skipped = step(items, 3, -1, (item) => item.widgetId !== 2);
    expect(ids(skipped).slice(0, 2)).toEqual([3, 1]);
    expect(step(items, 1, -1)).toBe(items);
  });

  it('keeps sizes inside the limits of each widget', () => {
    const attention = idOf('summary-attention');
    const small = resize(items, attention, { width: 1, height: 99 }, own);
    expect(small.find((item) => item.widgetId === attention)).toMatchObject({
      width: limitsOf(own[1]!).minWidth,
      height: 12,
    });
    expect(resize(items, 999, { width: 4, height: 2 }, own)).toBe(items);
    expect(mediumWidth(4)).toBe(6);
    expect(mediumWidth(8)).toBe(12);
  });
});
