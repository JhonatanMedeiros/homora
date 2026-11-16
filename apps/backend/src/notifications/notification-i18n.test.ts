import { describe, expect, it } from 'vitest';
import { notificationText } from './notification-i18n.js';
import { notificationEnglish, notificationPortuguese } from '@homora/i18n/notifications';
import type { ServiceStatus } from '../monitoring/index.js';
import type { NotificationEvent } from './notification-transitions.js';

const event: NotificationEvent = {
  event: 'up',
  service: { id: 1, name: 'Example', category: '' },
  status: 'available',
  reason: 'redirect',
  httpStatus: 302,
  latencyMs: 42,
  at: '2026-01-01T00:00:00.000Z',
  outageDurationMs: 3661000,
};

describe('notification text', () => {
  it('translates every monitoring reason in both languages', () => {
    const reasons: Record<ServiceStatus['reason'], true> = {
      responding: true,
      redirect: true,
      'login-required': true,
      'unexpected-status': true,
      'not-found': true,
      'error-status': true,
      reachable: true,
      'no-response': true,
      'destination-blocked': true,
      'content-mismatch': true,
      'cert-expired': true,
      'cert-invalid': true,
      'cert-expiring': true,
      maintenance: true,
      unchecked: true,
    };
    for (const reason of Object.keys(reasons) as ServiceStatus['reason'][]) {
      for (const [locale, translations] of [
        ['en', notificationEnglish],
        ['pt-BR', notificationPortuguese],
      ] as const) {
        expect(notificationText(locale, { ...event, reason })).toContain(translations[reason]);
      }
    }
  });

  it('shows available details and duration in the channel language', () => {
    expect(notificationText('pt-BR', event)).toBe(
      '✅ Homora · Serviço recuperado\nExample\nDetalhes: redirecionamento · HTTP 302\nTempo de resposta: 42 ms\nTempo indisponível: 1 h 1 min 1 s',
    );
    expect(notificationText('en', event)).toContain('Details: redirected · HTTP 302');
  });
});
