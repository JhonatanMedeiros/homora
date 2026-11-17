import { describe, expect, it } from 'vitest';
import { isPortableWidget, monitoringSources, supportsSource } from '../../index.js';
import {
  availabilityStateKey,
  defaultAvailabilityConfig,
  formatAvailabilityPct,
  widgetAvailabilityWidget,
} from './definition.js';

describe('availability widget', () => {
  it('declares internal source, portability, and normal/wide sizes', () => {
    expect(widgetAvailabilityWidget.source).toEqual(monitoringSources.availability);
    expect(supportsSource(widgetAvailabilityWidget.source, monitoringSources.availability)).toBe(
      true,
    );
    expect(isPortableWidget(widgetAvailabilityWidget)).toBe(true);
    expect(widgetAvailabilityWidget.sizes).toEqual(['normal', 'wide']);
  });

  it('validates target and range strictly', () => {
    expect(widgetAvailabilityWidget.parseConfig({ target: 'Jellyfin', range: '24h' })).toEqual({
      target: 'Jellyfin',
      range: '24h',
    });
    expect(widgetAvailabilityWidget.parseConfig({ target: 'DNS Probe', range: '30d' })).toEqual({
      target: 'DNS Probe',
      range: '30d',
    });
    expect(widgetAvailabilityWidget.parseConfig(defaultAvailabilityConfig)).toBeNull();
    expect(widgetAvailabilityWidget.parseConfig(null)).toBeNull();
    expect(widgetAvailabilityWidget.parseConfig({ target: ' Jellyfin ', range: '24h' })).toBeNull();
    expect(widgetAvailabilityWidget.parseConfig({ target: 'Jellyfin', range: '90d' })).toBeNull();
    expect(
      widgetAvailabilityWidget.parseConfig({ target: 'a'.repeat(201), range: '7d' }),
    ).toBeNull();
    expect(
      widgetAvailabilityWidget.parseConfig({ target: 'Jellyfin', range: '24h', extra: true }),
    ).toBeNull();
  });

  it('formats availability percentage and state keys', () => {
    expect(formatAvailabilityPct(null, 'en')).toBeNull();
    expect(formatAvailabilityPct(100, 'en')).toBe('100%');
    expect(formatAvailabilityPct(99.5, 'en')).toBe('99.50%');
    expect(availabilityStateKey('maintenance')).toBe('availabilityWidget.state.maintenance');
  });
});
