import { describe, expect, it } from 'vitest';
import { widgetLatencyHistoryWidget as widget } from './definition.js';

describe('latency history configuration', () => {
  it('validates local identities, ranges, and portable configuration', () => {
    const config = { target: 'a'.repeat(32), range: '7d' } as const;
    expect(widget.parseConfig(widget.defaultConfig)).toEqual({ target: null, range: '24h' });
    expect(widget.parseConfig(config)).toEqual(config);
    expect(widget.portableConfig?.(config)).toEqual({ target: null, range: '7d' });
    expect(widget.parseConfig({ ...config, target: '1' })).toBeNull();
    expect(widget.parseConfig({ ...config, range: '90d' })).toBeNull();
    expect(widget.parseConfig({ ...config, extra: true })).toBeNull();
    expect(widget.sizes).toEqual(['normal', 'wide']);
  });
});
