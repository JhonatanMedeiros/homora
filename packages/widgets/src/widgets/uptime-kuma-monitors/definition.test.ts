import { describe, expect, it } from 'vitest';
import { defaultConfig, widgetUptimeKumaMonitorsWidget } from './definition.js';
import { parseMonitors, selectMonitors } from './logic.js';

describe('Uptime Kuma monitor widget', () => {
  it('validates bounded configuration and the connection contract', () => {
    expect(widgetUptimeKumaMonitorsWidget.parseConfig(defaultConfig)).toEqual(defaultConfig);
    expect(widgetUptimeKumaMonitorsWidget.source).toEqual({
      contract: 'integration:uptime-kuma',
      version: 1,
    });
    for (const invalid of [
      null,
      {},
      { ...defaultConfig, limit: 0 },
      { ...defaultConfig, limit: 51 },
      { ...defaultConfig, extra: true },
    ]) {
      expect(widgetUptimeKumaMonitorsWidget.parseConfig(invalid)).toBeNull();
    }
  });
  it('validates observations, filters groups and reports the total before limiting', () => {
    const data = {
      monitors: [
        { id: 1, name: 'Web', group: 'Services', status: 'up' },
        { id: 2, name: 'DB', group: 'Services', status: 'down' },
        { id: 3, name: 'Queue', group: 'Other', status: 'pending' },
      ],
    };
    const rows = parseMonitors(data)!;
    expect(selectMonitors(rows, { group: 'Services', limit: 1 })).toEqual({
      rows: [rows[0]],
      total: 2,
    });
    expect(selectMonitors(rows, { group: 'Missing', limit: 10 }).rows).toEqual([]);
    expect(parseMonitors({ monitors: [{ ...data.monitors[0], status: 'bogus' }] })).toBeNull();
    expect(parseMonitors({ monitors: Array(51).fill(data.monitors[0]) })).toBeNull();
    expect(parseMonitors({})).toBeNull();
  });
});
