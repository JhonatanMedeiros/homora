import { isDegraded, type MonitorSettings } from '@homora/shared';
import type { CheckType } from '@homora/shared';
import { formatDateTime, formatTime, t } from '@/i18n';
import type { LightState, ServiceStatus } from '@/lib/services';
import { formatDuration, reasonText } from '@/features/uptime/uptime-view';

/** What a service card or list row says about a service's health. */
export type StatusView = {
  /** Light state; "unknown" also covers monitoring that is blocked. */
  state: LightState;
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
  /** Online but slower than the service's limit. */
  degraded?: boolean;
};

const latency = (status?: ServiceStatus) =>
  typeof status?.latencyMs === 'number' ? `${Math.round(status.latencyMs)} ms` : null;

/**
 * One place that turns a monitor observation into text, so cards and list rows say the same
 * thing. Healthy answers read "Online" whatever the HTTP code; the code only surfaces when it
 * explains a failure.
 */
export function describeStatus(
  status: ServiceStatus | undefined,
  blocked: boolean,
  options: {
    /** The service's alert settings: its "degraded" latency limit. */
    monitor?: Pick<MonitorSettings, 'degradedLatencyMs'>;
    /** When the open incident began, so a failure says how long it has lasted. */
    downSince?: number | null;
    now?: number;
    /** How the service is checked, so a reachable answer says tcp, dns, tls or ping. */
    checkType?: CheckType;
    /** End of the maintenance window the service is in, when it is in one. */
    maintenanceUntil?: number | null;
  } = {},
): StatusView {
  const state = status?.status ?? 'unknown';
  const reason = status?.reason;
  const code = typeof status?.httpStatus === 'number' ? status.httpStatus : null;
  const title = code === null ? null : `HTTP ${code}`;
  if (reason === 'maintenance') {
    return {
      state: 'maintenance',
      blocked: false,
      label: t('status.maintenance'),
      tag: null,
      meta: null,
      note:
        typeof options.maintenanceUntil === 'number'
          ? t('card.note.maintenance', { time: formatDateTime(options.maintenanceUntil) })
          : t('card.note.maintenance', { time: '…' }),
      title: null,
      failing: false,
    };
  }
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
    const slow = isDegraded(options.monitor, state, status?.latencyMs);
    const limit = options.monitor?.degradedLatencyMs;
    return {
      state: slow ? 'degraded' : state,
      blocked: false,
      label: slow ? t('status.degraded') : t('status.available'),
      tag:
        reason === 'login-required'
          ? t('card.tag.login')
          : reason === 'reachable'
            ? options.checkType === 'tcp' ||
              options.checkType === 'dns' ||
              options.checkType === 'tls'
              ? t(`check.tag.${options.checkType}`)
              : t('card.tag.ping')
            : null,
      meta: latency(status),
      note:
        reason === 'cert-expiring' && typeof status?.certExpiresAt === 'number'
          ? t('card.note.certExpiring', {
              days: Math.max(
                0,
                Math.ceil((status.certExpiresAt - (options.now ?? Date.now())) / 86_400_000),
              ),
              date: formatDateTime(status.certExpiresAt),
            })
          : slow && typeof status?.latencyMs === 'number' && typeof limit === 'number'
            ? t('card.note.degraded', { latency: Math.round(status.latencyMs), limit })
            : null,
      title,
      failing: false,
      degraded: slow || reason === 'cert-expiring',
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
            : reason === 'content-mismatch' || reason === 'cert-invalid'
              ? reasonText(reason)
              : reason === 'cert-expired'
                ? typeof status?.certExpiresAt === 'number'
                  ? t('card.note.certExpired', { date: formatDateTime(status.certExpiresAt) })
                  : reasonText(reason)
                : reason === 'no-response'
                  ? status?.lastAttempt
                    ? t('card.note.noResponseAt', { time: formatTime(status.lastAttempt) })
                    : t('card.note.noResponse')
                  : status?.lastAttempt
                    ? t('card.lastAttempt', { time: formatTime(status.lastAttempt) })
                    : null;
    const since =
      typeof options.downSince === 'number'
        ? t('card.note.downSince', {
            time: formatTime(options.downSince),
            duration: formatDuration((options.now ?? Date.now()) - options.downSince),
          })
        : null;
    const known =
      reason === 'unexpected-status' ||
      reason === 'not-found' ||
      reason === 'error-status' ||
      reason === 'content-mismatch' ||
      reason === 'cert-expired' ||
      reason === 'cert-invalid' ||
      reason === 'no-response';
    return {
      state,
      blocked: false,
      label: t('status.unavailable'),
      tag: null,
      meta: latency(status),
      note: note && since ? `${note} · ${since}` : (note ?? since),
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
