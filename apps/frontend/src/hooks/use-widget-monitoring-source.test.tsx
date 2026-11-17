import { expect, it } from 'vitest';
import { parseWidgetMonitoringSource } from './use-widget-monitoring-source';
it('rejects malformed source responses', () => {
  expect(() =>
    parseWidgetMonitoringSource({
      generatedAt: 1,
      items: [{ name: 'bad' }],
      total: 1,
      unmeasured: 0,
      truncated: false,
    }),
  ).toThrow('invalid source');
});
