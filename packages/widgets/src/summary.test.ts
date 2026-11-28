import { describe, expect, it } from 'vitest';
import { isPortableWidget, summaryPlacement } from './index.js';
import { getWidget } from './registry.js';
import { summaryWidgetTypes } from './summary.js';

describe('Summary widgets', () => {
  it.each(summaryWidgetTypes)('registers %s as a portable widget without options', (type) => {
    const definition = getWidget(type)!;
    expect(definition.summaryOnly).toBe(true);
    expect(isPortableWidget(definition)).toBe(true);
    expect(definition.parseConfig({})).toEqual({});
    for (const value of [null, [], 'x', { limit: 3 }])
      expect(definition.parseConfig(value)).toBeNull();
    const size = summaryPlacement(definition);
    expect(size.minWidth).toBeLessThanOrEqual(size.width);
    expect(size.minHeight).toBeLessThanOrEqual(size.height);
    expect(size.width).toBeLessThanOrEqual(12);
  });

  it('places other widgets by their size', () => {
    expect(summaryPlacement(getWidget('clock')).width).toBe(4);
    expect(summaryPlacement(undefined, 'wide').width).toBe(8);
  });
});
