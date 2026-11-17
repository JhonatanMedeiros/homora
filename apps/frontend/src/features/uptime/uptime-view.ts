import { monitoringReasonKey } from '@homora/widgets';
import { isDegraded, type MonitorSettings, type UptimeBucket } from '@homora/shared';
import { splitDurationMs } from '@homora/utils';
import { formatNumber, t, tOr } from '@/i18n';

/** What one period of the history bar shows; `slow` is an online period above the degraded limit. */
export type BarState = 'up' | 'slow' | 'down' | 'partial' | 'unknown';

export function barState(
  bucket: UptimeBucket,
  settings?: Pick<MonitorSettings, 'degradedLatencyMs'>,
): BarState {
  return bucket.status === 'up' && isDegraded(settings, 'available', bucket.avgLatencyMs)
    ? 'slow'
    : bucket.status;
}

/** "7 min", "1 h 12 min", "3 d 4 h": two units at most, minutes as the floor. */
export function formatDuration(ms: number): string {
  const { days, hours, minutes } = splitDurationMs(ms);
  if (days === 0 && hours === 0 && minutes === 0) return t('duration.lessThanMinute');
  const parts: string[] = [];
  if (days) parts.push(t('duration.d', { n: days }));
  if (hours && (days === 0 || parts.length < 2)) parts.push(t('duration.h', { n: hours }));
  if (minutes && days === 0) parts.push(t('duration.min', { n: minutes }));
  return parts.join(' ');
}

/** The monitor's own failure vocabulary as a short phrase; never anything from a response body. */
export function reasonText(reason: string | undefined, httpStatus?: number | null): string {
  return tOr(monitoringReasonKey(reason, httpStatus), '', { code: httpStatus ?? 0 });
}

/** Points for a latency sparkline in a `width` x `height` box; gaps (no data) split the line. */
export function sparklinePaths(
  values: (number | null | undefined)[],
  width: number,
  height: number,
): string[] {
  const numbers = values.filter((v): v is number => typeof v === 'number');
  if (numbers.length < 2) return [];
  const max = Math.max(...numbers, 1);
  const pad = 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const paths: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (typeof value !== 'number') {
      if (current.length > 1) paths.push(current.join(' '));
      current = [];
      return;
    }
    const y = height - pad - (value / max) * (height - pad * 2);
    current.push(`${(index * step).toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) paths.push(current.join(' '));
  return paths;
}

/** "▲ +0.10 pp" for a change in availability, with the tone it deserves; null without a comparison. */
export function deltaText(
  delta: number | null | undefined,
): { text: string; tone: 'up' | 'down' | 'same' } | null {
  if (typeof delta !== 'number') return null;
  if (delta === 0) return { text: t('detail.delta.same'), tone: 'same' };
  const pp = formatNumber(Math.abs(delta), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    text: t(delta > 0 ? 'detail.delta.up' : 'detail.delta.down', { pp }),
    tone: delta > 0 ? 'up' : 'down',
  };
}
