import { describe, expect, it } from 'vitest';
import { supportsSource } from './index.js';
import { clockWidget, defaultClockConfig, clockPresentation } from './clock.js';

describe('widget contracts', () => {
  it('requires the exact source contract and version', () => {
    const source = { contract: 'system-telemetry', version: 1 };
    expect(supportsSource(source, source)).toBe(true);
    expect(supportsSource(source, { ...source, version: 2 })).toBe(false);
    expect(supportsSource(source, { ...source, contract: 'other' })).toBe(false);
    expect(supportsSource(null, source)).toBe(false);
    expect(supportsSource(null, null)).toBe(true);
  });

  it('validates clock configuration and rejects unsupported zones and extra fields', () => {
    expect(clockWidget.parseConfig(defaultClockConfig)).toEqual(defaultClockConfig);
    expect(clockWidget.parseConfig({ ...defaultClockConfig, timeZone: 'UTC' })).not.toBeNull();
    expect(clockWidget.parseConfig({ ...defaultClockConfig, timeZone: 'not/a-zone' })).toBeNull();
    expect(clockWidget.parseConfig({ ...defaultClockConfig, seconds: 'true' })).toBeNull();
    expect(clockWidget.parseConfig({ ...defaultClockConfig, extra: true })).toBeNull();
  });
  it('formats a fixed instant in the chosen zone, including daylight saving changes', () => {
    const config = {
      ...defaultClockConfig,
      timeZone: 'America/New_York',
      hourFormat: '24h' as const,
    };
    const show = (date: string) =>
      clockPresentation.present({ locale: 'en-GB', config, now: new Date(date) }).time;
    expect(show('2026-01-15T12:00:00Z')).toBe('07:00');
    expect(show('2026-07-15T12:00:00Z')).toBe('08:00');
  });
});
