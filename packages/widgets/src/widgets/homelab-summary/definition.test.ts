import { describe, expect, it } from 'vitest';
import { summarizeCounts, widgetHomelabSummaryWidget } from './definition.js';

describe('homelab summary', () => {
  it('accepts its default configuration and rejects invalid selections', () => {
    expect(
      widgetHomelabSummaryWidget.parseConfig(widgetHomelabSummaryWidget.defaultConfig),
    ).toEqual(widgetHomelabSummaryWidget.defaultConfig);
    expect(
      widgetHomelabSummaryWidget.parseConfig({ showUnmeasured: true, groups: [1], pages: [] }),
    ).toBeNull();
  });
  it('keeps maintenance and missing measurements out of problems', () => {
    expect(
      summarizeCounts({ ok: 3, down: 1, degraded: 2, maintenance: 4, unknown: 5, blocked: 6 }),
    ).toMatchObject({ total: 21, unmeasured: 11, problems: 3 });
    expect(
      summarizeCounts({ ok: 0, down: 0, degraded: 0, maintenance: 0, unknown: 0, blocked: 0 })
        .total,
    ).toBe(0);
  });
});

it('resolves portable names without broadening a missing selection', async () => {
  const { resolveSelection } = await import('./definition.js');
  expect(resolveSelection(['Media'], [{ id: 42, name: 'Media' }])).toEqual([42]);
  expect(resolveSelection(['Media'], [{ id: 7, name: 'Media' }])).toEqual([7]);
  expect(resolveSelection(['Missing'], [])).toEqual([0]);
  expect(resolveSelection([], [])).toEqual([]);
});
