import { describe, expect, it } from 'vitest';
import type { LatencySeries } from '@homora/shared';
import {
  deltaPoints,
  heatDays,
  heatLevel,
  heatUptime,
  latencyGeometry,
  linePaths,
  longestClean,
  niceMax,
  reasonShares,
} from './detail-view';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('niceMax', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect([
      niceMax(0),
      niceMax(42),
      niceMax(130),
      niceMax(900),
      niceMax(1500),
      niceMax(2001),
    ]).toEqual([100, 50, 200, 1000, 2000, 5000]);
  });
});

describe('linePaths', () => {
  it('splits at gaps and keeps lone points visible', () => {
    const paths = linePaths(
      [1, 2, null, 3, null, 4, 5],
      (i) => i * 10,
      (v) => v,
    );
    expect(paths).toEqual(['M0.0 1.0 L10.0 2.0', 'M30.0 3.0 h0.01', 'M50.0 4.0 L60.0 5.0']);
  });
});

describe('latencyGeometry', () => {
  const series: LatencySeries = {
    range: '24h',
    bucketMs: HOUR,
    start: 0,
    p50: 100,
    p95: 900,
    max: 900,
    points: Array.from({ length: 24 }, (_, i) => ({
      start: i * HOUR,
      p50: i === 5 ? null : 100,
      p95: i === 5 ? null : 900,
      max: 900,
      checks: i === 5 ? 0 : 10,
    })),
  };
  it('scales to a round top, draws the limit and shades incidents', () => {
    const geometry = latencyGeometry(
      series,
      [
        { startedAt: 20 * HOUR, endedAt: null },
        { startedAt: -5 * HOUR, endedAt: -1 * HOUR },
      ],
      800,
      24 * HOUR,
    );
    expect(geometry.maxMs).toBe(1000);
    expect(geometry.thresholdY).not.toBeNull();
    expect(geometry.p50).toHaveLength(2);
    expect(geometry.incidents).toHaveLength(1);
    expect(geometry.incidents[0]?.x).toBeGreaterThan(900);
    expect(geometry.axis).toHaveLength(5);
  });
  it('leaves the limit out when it would flatten the lines', () => {
    expect(latencyGeometry(series, [], 60_000, 24 * HOUR).thresholdY).toBeNull();
    expect(latencyGeometry(series, [], null, 24 * HOUR).thresholdY).toBeNull();
  });
});

describe('heat map', () => {
  it('maps availability to levels', () => {
    expect([null, 100, 99.7, 99, 97].map((v) => heatLevel(v))).toEqual([
      'none',
      'full',
      'high',
      'warn',
      'down',
    ]);
  });
  it('groups hourly rows into local days ending today', () => {
    const now = new Date(2026, 10, 12, 15).getTime();
    const day = new Date(2026, 10, 11).getTime();
    const days = heatDays(
      [
        { hour: day + 2 * HOUR, up: 90, down: 0, unknown: 0 },
        { hour: day + 3 * HOUR, up: 6, down: 4, unknown: 0 },
        { hour: now - HOUR, up: 1, down: 1, unknown: 0 },
      ],
      now,
    );
    expect(days).toHaveLength(91);
    expect(days.at(-1)?.date.getDate()).toBe(12);
    expect(days.at(-2)).toMatchObject({ pct: 96, level: 'down' });
    expect(days.at(-1)?.pct).toBe(50);
    expect(days[0]?.level).toBe('none');
    expect(heatUptime([{ hour: 0, up: 99, down: 1, unknown: 0 }])).toBe(99);
    expect(heatUptime([{ hour: 0, up: 2, down: 1, unknown: 0 }])).toBeNull();
  });
});

describe('reasonShares', () => {
  it('turns counts into percentages', () => {
    expect(
      reasonShares([
        { reason: 'error-status', httpStatus: 502, count: 3 },
        { reason: 'no-response', httpStatus: null, count: 1 },
      ]).map((s) => [s.key, s.pct]),
    ).toEqual([
      ['error-status:502', 75],
      ['no-response:', 25],
    ]);
    expect(reasonShares([])).toEqual([]);
  });
});

describe('longestClean', () => {
  it('finds the longest gap and the current one, counting an open incident up to now', () => {
    const now = 30 * DAY;
    expect(
      longestClean(
        [
          { startedAt: 10 * DAY, endedAt: 10 * DAY + HOUR },
          { startedAt: 29 * DAY, endedAt: null },
        ],
        0,
        now,
      ),
    ).toEqual({ longest: 19 * DAY - HOUR, current: 0 });
    expect(longestClean([], 5 * DAY, now)).toEqual({ longest: 25 * DAY, current: 25 * DAY });
  });
});

describe('deltaPoints', () => {
  it('is the difference in points or null', () => {
    expect(deltaPoints(99.31, 99.51)).toBe(-0.2);
    expect(deltaPoints(null, 99)).toBeNull();
    expect(deltaPoints(99, null)).toBeNull();
    expect(deltaPoints(99, undefined)).toBeNull();
  });
});
