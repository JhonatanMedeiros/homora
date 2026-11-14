import { formatNumber, t } from '@/i18n';
import type { HeatLevel } from '@/lib/detail-view';
import { deltaText } from '@/features/uptime/uptime-view';

export const DAY = 86_400_000;
export const pct = (value: number) =>
  formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ms = (value: number | null) =>
  value === null ? t('uptime.none') : formatNumber(Math.round(value));
export const shortDate = (value: number) =>
  new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(new Date(value));
export const INITIAL_INCIDENTS = 8;

export const HEAT_CLASS: Record<HeatLevel, string> = {
  none: 'bg-muted',
  full: 'bg-success',
  high: 'bg-success/55',
  warn: 'bg-warning',
  down: 'bg-destructive',
};

export function deltaNote(delta: number | null, context: string) {
  const text = deltaText(delta);
  if (!text) return { text: null, tone: undefined };
  return {
    text: `${text.text} ${context}`,
    tone: text.tone === 'same' ? undefined : text.tone,
  };
}
