import type { ServiceInput } from '@homora/shared';
import { formatDateTime } from '@/i18n';

export const emptyService: ServiceInput = {
  name: '',
  url: '',
  category: '',
  description: '',
  allowPrivate: false,
  checkType: 'http',
  checkInterval: null,
};

export type ServiceGroup = {
  id: number;
  name: string;
  position: number;
  /** Page (tab of the Home) the group is on. */
  pageId?: number;
  /** Grid columns on wide viewports (1 to 6); null falls back to automatic responsive grid. */
  columns?: number | null;
};
export type Availability = 'available' | 'unavailable' | 'unknown';
/** What the status light shows: an online service that is slower than its limit reads `degraded`. */
export type LightState = Availability | 'degraded' | 'maintenance';
/** Health probe status reason from monitor; absent in responses from older versions. */
export type StatusReason =
  | 'responding'
  | 'redirect'
  | 'login-required'
  | 'unexpected-status'
  | 'not-found'
  | 'error-status'
  | 'reachable'
  | 'no-response'
  | 'content-mismatch'
  | 'cert-expired'
  | 'cert-invalid'
  | 'cert-expiring'
  | 'maintenance'
  | 'unchecked';
export type ServiceStatus = {
  status: Availability;
  lastAttempt: string | null;
  reason?: StatusReason;
  httpStatus?: number | null;
  latencyMs?: number | null;
  expectedStatus?: string | null;
  /** TLS checks: when the certificate expires (epoch milliseconds). */
  certExpiresAt?: number;
};

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Addresses that the monitor network policy only polls with explicit authorization.
export function isPrivateHost(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)) return true;
  return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
}

export const formatAttempt = formatDateTime;

export const byPosition = <T extends { position?: number }>(a: T, b: T) =>
  (a.position ?? 0) - (b.position ?? 0);
