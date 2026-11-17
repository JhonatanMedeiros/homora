import { expect, it } from 'vitest';
import { defaultMaintenanceConfig, widgetMaintenanceScheduleWidget } from './definition.js';

it('accepts only bounded portable configurations and both supported sizes', () => {
  const parse = widgetMaintenanceScheduleWidget.parseConfig;
  expect(parse(defaultMaintenanceConfig)).toEqual(defaultMaintenanceConfig);
  expect(widgetMaintenanceScheduleWidget.sizes).toEqual(['normal', 'wide']);
  for (const change of [
    { days: 2 },
    { limit: 0 },
    { limit: 11 },
    { groups: ['a', 'a'] },
    { pages: [' '] },
    { other: true },
  ]) {
    expect(parse({ ...defaultMaintenanceConfig, ...change })).toBeNull();
  }
});
