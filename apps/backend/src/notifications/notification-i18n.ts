import { splitDurationMs } from '@homora/utils';
import i18next from 'i18next';
import type { Locale } from '@homora/i18n';
import { notificationEnglish, notificationPortuguese } from '@homora/i18n/notifications';
import type { NotificationEvent } from './notification-transitions.js';

const i18n = i18next.createInstance();
void i18n.init({
  initAsync: false,
  fallbackLng: 'en',
  resources: {
    en: { translation: notificationEnglish },
    'pt-BR': { translation: notificationPortuguese },
  },
});

export function notificationText(locale: Locale, event: NotificationEvent): string {
  const t = (key: string) => i18n.t(key, { lng: locale, defaultValue: key });
  const lines = [
    `${event.event === 'down' ? '🔴' : '✅'} Homora · ${t(event.event)}`,
    event.service.name,
  ];
  const reason = t(event.reason);
  lines.push(
    `${t('detail')}: ${reason}${event.httpStatus === null ? '' : ` · HTTP ${event.httpStatus}`}`,
  );
  if (event.latencyMs !== null) lines.push(`${t('latency')}: ${event.latencyMs} ms`);
  if (event.outageDurationMs !== undefined) {
    const duration = splitDurationMs(event.outageDurationMs);
    const parts: string[] = [];
    for (const [unit, value] of [
      ['day', duration.days],
      ['hour', duration.hours],
      ['minute', duration.minutes],
      ['second', duration.seconds],
    ] as const) {
      if (value) parts.push(`${value} ${t(unit)}`);
    }
    lines.push(`${t('duration')}: ${parts.join(' ') || `0 ${t('second')}`}`);
  }
  return lines.join('\n');
}
