import { formatTime, t } from '@/i18n';
import type { Availability, ServiceStatus } from '@/lib/services';

/** What a service card or list row says about a service's health. */
export type StatusView = {
  /** Light state; "unknown" also covers monitoring that is blocked. */
  state: Availability;
  blocked: boolean;
  /** Main word next to the light, such as "Online" or "Offline". */
  label: string;
  /** Short qualifier for healthy answers that need one: "login" or "ping". */
  tag: string | null;
  /** Latency, or a short fallback such as the last attempt time. */
  meta: string | null;
  /** Human sentence explaining a failure or blocked monitoring. */
  note: string | null;
  /** Technical detail kept out of sight, such as "HTTP 302". */
  title: string | null;
  /** The service failed for a known reason, so the details panel has something to show. */
  failing: boolean;
};

const latency = (status?: ServiceStatus) =>
  typeof status?.latencyMs === 'number' ? `${Math.round(status.latencyMs)} ms` : null;

/**
 * One place that turns a monitor observation into text, so cards and list rows say the same
 * thing. Healthy answers read "Online" whatever the HTTP code; the code only surfaces when it
 * explains a failure.
 */
export function describeStatus(status: ServiceStatus | undefined, blocked: boolean): StatusView {
  const state = status?.status ?? 'unknown';
  const reason = status?.reason;
  const code = typeof status?.httpStatus === 'number' ? status.httpStatus : null;
  const title = code === null ? null : `HTTP ${code}`;
  if (blocked && state !== 'available') {
    return {
      state: 'unknown',
      blocked: true,
      label: t('status.blocked'),
      tag: null,
      meta: null,
      note: t('card.note.blocked'),
      title: null,
      failing: false,
    };
  }
  if (state === 'available') {
    return {
      state,
      blocked: false,
      label: t('status.available'),
      tag:
        reason === 'login-required'
          ? t('card.tag.login')
          : reason === 'reachable'
            ? t('card.tag.ping')
            : null,
      meta: latency(status),
      note: null,
      title,
      failing: false,
    };
  }
  if (state === 'unavailable') {
    const note =
      reason === 'unexpected-status' && code !== null && status?.expectedStatus
        ? t('card.note.unexpected', { code, expected: status.expectedStatus })
        : reason === 'not-found'
          ? t('card.note.notFound')
          : reason === 'error-status'
            ? code === null
              ? t('card.note.errorGeneric')
              : t('card.note.error', { code })
            : reason === 'no-response'
              ? status?.lastAttempt
                ? t('card.note.noResponseAt', { time: formatTime(status.lastAttempt) })
                : t('card.note.noResponse')
              : status?.lastAttempt
                ? t('card.lastAttempt', { time: formatTime(status.lastAttempt) })
                : null;
    const known =
      reason === 'unexpected-status' ||
      reason === 'not-found' ||
      reason === 'error-status' ||
      reason === 'no-response';
    return {
      state,
      blocked: false,
      label: t('status.unavailable'),
      tag: null,
      meta: latency(status),
      note,
      title,
      failing: known,
    };
  }
  return {
    state,
    blocked: false,
    label: t('status.waiting'),
    tag: null,
    meta: t('card.meta.firstCheck'),
    note: null,
    title: null,
    failing: false,
  };
}
