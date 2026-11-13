import i18next from 'i18next';
import type { NotificationEvent } from './notification-transitions.js';

const i18n = i18next.createInstance();
void i18n.init({
  initAsync: false,
  fallbackLng: 'en',
  resources: {
    en: { translation: { up: 'UP', down: 'DOWN' } },
    'pt-BR': {
      translation: {
        up: 'ONLINE',
        down: 'OFFLINE',
        responding: 'respondendo',
        redirect: 'redirecionamento',
        'login-required': 'autenticação necessária',
        'unexpected-status': 'status inesperado',
        'not-found': 'não encontrado',
        'error-status': 'erro do servidor',
        reachable: 'acessível',
        'no-response': 'sem resposta',
        'content-mismatch': 'conteúdo inesperado',
        'cert-expired': 'certificado expirado',
        'cert-invalid': 'certificado inválido',
        'cert-expiring': 'certificado próximo do vencimento',
        maintenance: 'em manutenção',
        unchecked: 'não verificado',
      },
    },
  },
});

export function notificationText(locale: 'en' | 'pt-BR', event: NotificationEvent): string {
  return `${i18n.t(event.event, { lng: locale })} (${i18n.t(event.reason, { lng: locale, defaultValue: event.reason })})`;
}
