import { describe, expect, it } from 'vitest';
import {
  defaultCertificateConfig,
  expiryState,
  widgetCertificateExpiryWidget,
} from './definition.js';
describe('certificate expiry widget', () => {
  it('validates portable configuration', () => {
    expect(widgetCertificateExpiryWidget.parseConfig(defaultCertificateConfig)).toEqual(
      defaultCertificateConfig,
    );
    for (const value of [
      null,
      {},
      { ...defaultCertificateConfig, threshold: 8 },
      { ...defaultCertificateConfig, pages: ['A', 'A'] },
      { ...defaultCertificateConfig, extra: true },
    ])
      expect(widgetCertificateExpiryWidget.parseConfig(value)).toBeNull();
  });
  it('classifies the exact expiry and warning boundaries independently', () => {
    const now = 1_800_000_000_000;
    expect(expiryState(null, 30, now)).toBe('unknown');
    expect(expiryState(now, 30, now)).toBe('expired');
    expect(expiryState(now + 30 * 86_400_000, 30, now)).toBe('warning');
    expect(expiryState(now + 30 * 86_400_000 + 1, 30, now)).toBe('future');
    expect(expiryState(now + 14 * 86_400_000, 7, now)).toBe('future');
  });
});
