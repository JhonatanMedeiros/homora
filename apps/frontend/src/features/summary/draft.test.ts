import { describe, expect, it } from 'vitest';
import type { PageWidget } from '@/components/use-page-widget-data';
import {
  addWidget,
  isUnchanged,
  lostSettings,
  newWidget,
  removeWidget,
  restoreDefault,
  startDraft,
  toChange,
  updateWidget,
} from './draft';

const widget = (id: number, type: string, extra: Partial<PageWidget> = {}): PageWidget => ({
  id,
  pageId: 1,
  type,
  name: '',
  config: {},
  connectionId: null,
  position: id,
  version: 1,
  size: 'normal',
  ...extra,
});
const stored = [
  widget(1, 'summary-pinned'),
  widget(2, 'summary-latency', { config: { groups: ['Media'] } }),
  widget(3, 'note', { config: { text: 'x' } }),
];
const layout = {
  pageId: 1,
  revision: 4,
  desktop: [{ widgetId: 1, width: 12, height: 1 }],
  phone: [{ widgetId: 1 }, { widgetId: 2 }],
};

describe('a Summary draft', () => {
  const start = startDraft(1, false, layout);
  const clock = { ...widget(0, 'clock') };

  it('numbers new widgets apart and forgets them when removed', () => {
    const first = addWidget(start, newWidget(start, clock));
    const both = addWidget(first, newWidget(first, clock));
    expect(both.add.map((item) => item.id)).toEqual([-1, -2]);
    const edited = updateWidget(both, { ...both.add[1]!, name: 'Hall' });
    expect(edited.add[1]!.name).toBe('Hall');
    expect(removeWidget(edited, -1).add.map((item) => item.id)).toEqual([-2]);
    expect(removeWidget(edited, 1).remove).toEqual([1]);
    expect(isUnchanged(start, layout)).toBe(true);
    expect(isUnchanged(first, layout)).toBe(false);
  });

  it('asks only about widgets that could not be added back as they were', () => {
    const draft = [1, 2, 3].reduce(removeWidget, start);
    expect(lostSettings(draft, stored).map((item) => item.id)).toEqual([2, 3]);
  });

  it('restores the Summary widgets without repeating the ones present', () => {
    const draft = restoreDefault([1, 3].reduce(removeWidget, start), stored);
    expect(draft.items).toBeNull();
    expect(draft.remove).toEqual([3]);
    const types = draft.add.map((item) => item.type);
    expect(types).toHaveLength(9);
    expect(types).not.toContain('summary-pinned');
    expect(types).not.toContain('summary-latency');
    expect(restoreDefault(draft, stored).add).toHaveLength(9);
  });

  it('drops the places of widgets that will not exist, on both kinds of screen', () => {
    const change = toChange(removeWidget(start, 1), layout, new Set([2]));
    expect(change).toMatchObject({ revision: 4, desktop: [], phone: [{ widgetId: 2 }] });
    expect(change.remove).toEqual([1]);
  });
});
