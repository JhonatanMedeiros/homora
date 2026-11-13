import type { Incident, LatencySeries, ServiceInsights } from '@homora/shared';

export const CHART = { width: 1120, height: 240, left: 48, top: 20, bottom: 210 } as const;

/** The next "round" number (1, 2, 5 × 10ⁿ) at or above `value`, for a chart's top gridline. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  const unit = value / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

type Line = (number | null)[];

/** Path pieces of a series on the chart; a missing point ends the piece, so gaps stay gaps. */
export function linePaths(values: Line, x: (index: number) => number, y: (v: number) => number) {
  const paths: string[] = [];
  let piece: string[] = [];
  const flush = () => {
    if (piece.length > 1) paths.push(piece.join(' '));
    else if (piece.length === 1) paths.push(`${piece[0]} h0.01`);
    piece = [];
  };
  values.forEach((value, index) => {
    if (value === null) return flush();
    piece.push(`${piece.length ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`);
  });
  flush();
  return paths;
}

export type LatencyGeometry = {
  p50: string[];
  p95: string[];
  ticks: { y: number; ms: number }[];
  thresholdY: number | null;
  incidents: { x: number; width: number }[];
  axis: { x: number; at: number }[];
  maxMs: number;
};

/**
 * Everything the latency chart draws, in SVG units: both percentile lines, round gridlines, the
 * "degraded" limit when it fits, the stretches an incident covered and the time labels.
 */
export function latencyGeometry(
  series: LatencySeries,
  incidents: Pick<Incident, 'startedAt' | 'endedAt'>[],
  degradedLatencyMs: number | null,
  now: number,
): LatencyGeometry {
  const { left, top, bottom, width } = CHART;
  const count = series.points.length;
  const end = series.start + count * series.bucketMs;
  const xOfTime = (time: number) =>
    left +
    ((Math.min(Math.max(time, series.start), end) - series.start) / (end - series.start)) *
      (width - left);
  const peak = Math.max(0, ...series.points.map((point) => point.p95 ?? point.p50 ?? 0));
  const limit = degradedLatencyMs !== null && degradedLatencyMs <= peak * 3 ? degradedLatencyMs : 0;
  const maxMs = niceMax(Math.max(peak, limit * 1.2));
  const y = (ms: number) => bottom - (Math.min(ms, maxMs) / maxMs) * (bottom - top);
  const x = (index: number) => left + ((index + 0.5) / count) * (width - left);
  const lines = (pick: 'p50' | 'p95') =>
    linePaths(
      series.points.map((point) => point[pick]),
      x,
      y,
    );
  const covering = incidents
    .filter((item) => item.startedAt < end && (item.endedAt ?? now) > series.start)
    .map((item) => {
      const from = xOfTime(item.startedAt);
      return { x: from, width: Math.max(3, xOfTime(item.endedAt ?? now) - from) };
    });
  return {
    p50: lines('p50'),
    p95: lines('p95'),
    ticks: [0, 1, 2, 3, 4].map((step) => ({ ms: (maxMs / 4) * step, y: y((maxMs / 4) * step) })),
    thresholdY: limit ? y(limit) : null,
    incidents: covering,
    axis: [0, 1, 2, 3, 4].map((step) => ({
      x: left + (step / 4) * (width - left),
      at: series.start + (step / 4) * (end - series.start),
    })),
    maxMs,
  };
}

export type HeatLevel = 'none' | 'full' | 'high' | 'warn' | 'down';
export type HeatDay = { date: Date; pct: number | null; level: HeatLevel };

export function heatLevel(pct: number | null): HeatLevel {
  if (pct === null) return 'none';
  if (pct >= 99.9) return 'full';
  if (pct >= 99.5) return 'high';
  if (pct >= 98) return 'warn';
  return 'down';
}

/** Hourly counts grouped into the viewer's own calendar days, oldest first, ending today. */
export function heatDays(heat: ServiceInsights['heat'], now: number, days = 91): HeatDay[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, { up: number; down: number }>();
  for (const row of heat) {
    const day = new Date(row.hour);
    day.setHours(0, 0, 0, 0);
    const key = day.getTime().toString();
    const entry = counts.get(key) ?? { up: 0, down: 0 };
    entry.up += row.up;
    entry.down += row.down;
    counts.set(key, entry);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const entry = counts.get(date.getTime().toString());
    const total = entry ? entry.up + entry.down : 0;
    const pct = entry && total > 0 ? Math.round((entry.up / total) * 10_000) / 100 : null;
    return { date, pct, level: heatLevel(pct) };
  });
}

/** Availability over all of `heat`, or null without enough checks. */
export function heatUptime(heat: ServiceInsights['heat'], minChecks = 5): number | null {
  let up = 0;
  let down = 0;
  for (const row of heat) {
    up += row.up;
    down += row.down;
  }
  return up + down >= minChecks ? Math.round((up / (up + down)) * 10_000) / 100 : null;
}

/** Share of each failure reason, largest first; shares of a rounded 100 may differ by one. */
export function reasonShares(reasons: ServiceInsights['reasons']) {
  const total = reasons.reduce((sum, item) => sum + item.count, 0);
  return reasons.map((item) => ({
    ...item,
    key: `${item.reason}:${item.httpStatus ?? ''}`,
    pct: total ? Math.round((item.count / total) * 100) : 0,
  }));
}

/** Longest stretch without an open incident between `from` and `now` (open incidents end at `now`). */
export function longestClean(
  incidents: Pick<Incident, 'startedAt' | 'endedAt'>[],
  from: number,
  now: number,
): { longest: number; current: number } {
  const sorted = incidents
    .map((item) => ({
      start: Math.max(item.startedAt, from),
      end: Math.min(item.endedAt ?? now, now),
    }))
    .filter((item) => item.end > from)
    .sort((a, b) => a.start - b.start);
  let cursor = from;
  let longest = 0;
  for (const item of sorted) {
    longest = Math.max(longest, item.start - cursor);
    cursor = Math.max(cursor, item.end);
  }
  longest = Math.max(longest, now - cursor);
  return { longest, current: now - cursor };
}

/** Change in percentage points, two decimals; null when either side is unknown. */
export function deltaPoints(current: number | null, previous: number | null | undefined) {
  if (current === null || typeof previous !== 'number') return null;
  return Math.round((current - previous) * 100) / 100;
}
