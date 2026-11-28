import { describe, expect, it } from 'vitest';
import { isPortableWidget, summaryPlacement } from './index.js';
import { getWidget } from './registry.js';
import { summaryWidgets, summaryWidgetTypes } from './summary.js';

describe('Summary widgets', () => {
  it.each(summaryWidgetTypes)('registers %s as a portable widget that shows everything', (type) => {
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

it('narrows a widget only by what it can show, keeping everything as an empty configuration', () => {
  const latency = summaryWidgets['summary-latency'];
  expect(latency.parseConfig({ groups: ['Media'], pages: [] })).toEqual({ groups: ['Media'] });
  expect(latency.parseConfig({ groups: [] })).toEqual({});
  for (const bad of [
    { probes: ['NAS'] },
    { groups: 'Media' },
    { groups: [''] },
    { groups: ['a', 'a'] },
    { groups: Array.from({ length: 101 }, (_, index) => `g${index}`) },
  ])
    expect(latency.parseConfig(bad)).toBeNull();
  expect(summaryWidgets['summary-probes'].parseConfig({ probes: ['NAS'] })).toEqual({
    probes: ['NAS'],
  });
  expect(summaryWidgets['summary-figures'].parseConfig({ groups: ['Media'] })).toBeNull();
});
