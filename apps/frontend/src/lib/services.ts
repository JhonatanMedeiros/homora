import type { ServiceInput } from '@homora/shared';
import { formatDateTime } from '@/i18n';

export const emptyService: ServiceInput = {
  name: '',
  url: '',
  category: '',
  description: '',
  allowPrivate: false,
};

export type ServiceGroup = {
  id: number;
  name: string;
  position: number;
  /** Colunas da grade em telas largas (1 a 6); nulo é o ajuste automático. */
  columns?: number | null;
};
export type Availability = 'available' | 'unavailable' | 'unknown';
export type ServiceStatus = { status: Availability; lastAttempt: string | null };

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Endereços que a política de rede do monitor só consulta com autorização explícita.
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
