import { expect, it } from 'vitest';
import { widgetHealthchecksJobsWidget } from './definition.js';

it('accepts only a bounded row limit', () => {
  expect(widgetHealthchecksJobsWidget.parseConfig({ limit: 10 })).toEqual({ limit: 10 });
  for (const value of [
    null,
    {},
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: 1, extra: true },
  ])
    expect(widgetHealthchecksJobsWidget.parseConfig(value)).toBeNull();
});
