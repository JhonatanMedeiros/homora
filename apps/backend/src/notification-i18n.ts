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
  return `${i18n.t(event.event, { lng: locale })} (${i18n.t(event.reason, { lng: locale, defaultValue: event.reason })})`;
}
