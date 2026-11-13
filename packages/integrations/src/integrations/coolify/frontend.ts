import { definePresentation, type WidgetStat } from '../../frontend.js';

type Key =
  | 'coolify.stat.total'
  | 'coolify.stat.running'
  | 'coolify.stat.degraded'
  | 'coolify.stat.stopped'
  | 'coolify.stat.unknown';

export function parseSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = ['total', 'running', 'degraded', 'stopped', 'unknown'] as const;
  if (
    !keys.every(
      (key) =>
        typeof input[key] === 'number' &&
        Number.isSafeInteger(input[key]) &&
        (input[key] as number) >= 0,
    )
  )
    return null;
  return Object.fromEntries(keys.map((key) => [key, input[key]])) as Record<
    (typeof keys)[number],
    number
  >;
}

export function createCoolifyPresentation(t: (key: Key) => string) {
  function stats(value: unknown): WidgetStat[] | null {
    const summary = parseSummary(value);
    if (!summary) return null;
    const stats: WidgetStat[] = [
      { label: t('coolify.stat.total'), value: String(summary.total) },
      { label: t('coolify.stat.running'), value: String(summary.running) },
    ];
    if (summary.degraded > 0)
      stats.push({ label: t('coolify.stat.degraded'), value: String(summary.degraded) });
    if (summary.stopped > 0)
      stats.push({ label: t('coolify.stat.stopped'), value: String(summary.stopped) });
    if (summary.unknown > 0)
      stats.push({ label: t('coolify.stat.unknown'), value: String(summary.unknown) });
    return stats;
  }

  return definePresentation({ stats });
}
