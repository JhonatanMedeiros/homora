import { describe, expect, it } from 'vitest';
import { barState, formatDuration, reasonText, sparklinePaths } from '@/lib/uptime-view';
import { describeStatus } from '@/lib/status-text';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  it('uses at most two units and never shows seconds', () => {
    expect(formatDuration(5_000)).toBe('< 1 min');
    expect(formatDuration(7 * MIN + 40_000)).toBe('7 min');
    expect(formatDuration(HOUR + 12 * MIN)).toBe('1 h 12 min');
    expect(formatDuration(2 * HOUR)).toBe('2 h');
    expect(formatDuration(3 * DAY + 4 * HOUR + 9 * MIN)).toBe('3 d 4 h');
    expect(formatDuration(18 * DAY)).toBe('18 d');
    expect(formatDuration(-5)).toBe('< 1 min');
  });
});

describe('barState', () => {
  const up = { start: 'x', status: 'up' as const, avgLatencyMs: 900 };
  it('reads an online period slower than the limit as slow, never a failing one', () => {
    expect(barState(up)).toBe('up');
    expect(barState(up, { degradedLatencyMs: null })).toBe('up');
    expect(barState(up, { degradedLatencyMs: 800 })).toBe('slow');
    expect(barState({ ...up, avgLatencyMs: 800 }, { degradedLatencyMs: 800 })).toBe('up');
    expect(barState({ ...up, status: 'down' }, { degradedLatencyMs: 800 })).toBe('down');
    expect(barState({ ...up, avgLatencyMs: undefined }, { degradedLatencyMs: 800 })).toBe('up');
  });
});

describe('reasonText', () => {
  it('speaks the monitor’s vocabulary and never needs a response body', () => {
    expect(reasonText('error-status', 502)).toBe('HTTP 502');
    expect(reasonText('error-status', null)).toBe('Resposta de erro');
    expect(reasonText('no-response')).toBe('Sem resposta');
    expect(reasonText('unexpected-status', 301)).toBe('HTTP 301 inesperado');
    expect(reasonText('not-found', 404)).toBe('HTTP 404');
    expect(reasonText('something-new')).toBe('Falhou');
  });
});

describe('sparklinePaths', () => {
  it('splits the line where there were no checks and needs two points to draw', () => {
    expect(sparklinePaths([null, 5, null], 100, 24)).toEqual([]);
    const paths = sparklinePaths([10, 20, null, 30, 40], 100, 24);
    expect(paths).toHaveLength(2);
    expect(paths[0]?.split(' ')).toHaveLength(2);
    // Higher latency sits higher (smaller y) and stays inside the box.
    const ys = paths.flatMap((p) => p.split(' ').map((pt) => Number(pt.split(',')[1])));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(24);
    expect(ys[1]!).toBeLessThan(ys[0]!);
  });
});

describe('describeStatus with alert settings', () => {
  const ok = { status: 'available' as const, lastAttempt: '2026-11-12T12:00:00Z', latencyMs: 1840 };
  it('says Degraded, and why, for an online service over its limit', () => {
    const view = describeStatus(ok, false, { monitor: { degradedLatencyMs: 800 } });
    expect(view).toMatchObject({
      state: 'degraded',
      label: 'Degradado',
      degraded: true,
      failing: false,
    });
    expect(view.note).toBe('Lento: 1840 ms, acima do limite de 800 ms');
    expect(describeStatus(ok, false, { monitor: { degradedLatencyMs: null } }).state).toBe(
      'available',
    );
    expect(describeStatus(ok, false).label).toBe('No ar');
  });
  it('adds how long a failing service has been down', () => {
    const now = Date.parse('2026-11-12T20:57:00Z');
    const view = describeStatus(
      {
        status: 'unavailable',
        lastAttempt: '2026-11-12T20:57:00Z',
        reason: 'error-status',
        httpStatus: 502,
      },
      false,
      { downSince: now - 27 * MIN, now },
    );
    expect(view.note).toMatch(/502.* · fora do ar desde .* \(27 min\)/);
    expect(view.failing).toBe(true);
  });
});
