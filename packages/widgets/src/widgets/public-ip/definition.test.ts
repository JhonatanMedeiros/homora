import { describe, expect, it } from 'vitest';
import { defaultPublicIpConfig, widgetPublicIpWidget } from './definition.js';

describe('public-ip widget definition', () => {
  it('declares normal size, version 1, and portable page placement', () => {
    expect(widgetPublicIpWidget.type).toBe('public-ip');
    expect(widgetPublicIpWidget.version).toBe(1);
    expect(widgetPublicIpWidget.locations).toEqual(['page']);
    expect(widgetPublicIpWidget.sizes).toEqual(['normal']);
    expect(widgetPublicIpWidget.portable).toBe(true);
    expect(widgetPublicIpWidget.source).toBeNull();
  });

  it('accepts valid configurations and rejects invalid input', () => {
    expect(widgetPublicIpWidget.parseConfig(defaultPublicIpConfig)).toEqual(defaultPublicIpConfig);
    expect(
      widgetPublicIpWidget.parseConfig({
        provider: 'icanhazip',
        addressFamily: 'both',
        optIn: true,
        maskByDefault: false,
      }),
    ).toEqual({
      provider: 'icanhazip',
      addressFamily: 'both',
      optIn: true,
      maskByDefault: false,
    });

    expect(widgetPublicIpWidget.parseConfig(null)).toBeNull();
    expect(widgetPublicIpWidget.parseConfig([])).toBeNull();
    expect(widgetPublicIpWidget.parseConfig({ ...defaultPublicIpConfig, extra: true })).toBeNull();
    expect(
      widgetPublicIpWidget.parseConfig({ ...defaultPublicIpConfig, provider: 'custom' }),
    ).toBeNull();
    expect(
      widgetPublicIpWidget.parseConfig({ ...defaultPublicIpConfig, addressFamily: 'any' }),
    ).toBeNull();
    expect(widgetPublicIpWidget.parseConfig({ ...defaultPublicIpConfig, optIn: 'yes' })).toBeNull();
    expect(
      widgetPublicIpWidget.parseConfig({ ...defaultPublicIpConfig, maskByDefault: 1 }),
    ).toBeNull();
  });
});
