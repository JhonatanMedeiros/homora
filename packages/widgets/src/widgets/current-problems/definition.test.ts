import { describe, expect, it } from 'vitest';
import { defaultProblemsConfig, selectProblems, widgetProblemsWidget } from './definition.js';
import type { MonitoringProblem } from '../../monitoring.js';

describe('problems widget', () => {
  it('validates the complete configuration strictly', () => {
    expect(widgetProblemsWidget.parseConfig(defaultProblemsConfig)).toEqual(defaultProblemsConfig);
    for (const config of [
      null,
      {},
      { ...defaultProblemsConfig, limit: 11 },
      { ...defaultProblemsConfig, pages: ['Home', 'Home'] },
      { ...defaultProblemsConfig, pages: [1n] },
      { ...defaultProblemsConfig, extra: true },
    ])
      expect(widgetProblemsWidget.parseConfig(config)).toBeNull();
  });
  it('orders offline first, oldest first, then limits the result', () => {
    const item = (
      id: number,
      state: 'down' | 'degraded',
      since: number | null,
    ): MonitoringProblem => ({
      id,
      name: String(id),
      state,
      since,
      stale: false,
      lastAttempt: null,
      latencyMs: null,
      reason: null,
      httpStatus: null,
      isService: true,
    });
    const items = [
      item(1, 'degraded', 10),
      item(5, 'degraded', 1),
      item(2, 'down', null),
      item(3, 'down', 10),
      item(4, 'down', 2),
    ];
    const result = selectProblems(items, { ...defaultProblemsConfig, limit: 2 });
    expect(result.items.map((entry) => entry.id)).toEqual([4, 3]);
    expect(result.total).toBe(5);
    expect(selectProblems(items, defaultProblemsConfig).items.map((entry) => entry.id)).toEqual([
      4, 3, 2, 5, 1,
    ]);
    expect(selectProblems(items, { ...defaultProblemsConfig, includeDegraded: false }).total).toBe(
      3,
    );
  });
});
