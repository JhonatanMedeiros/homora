import { apiError, t } from '@/i18n';
export type Kind = 'jellyfin' | 'home-assistant' | 'uptime-kuma' | 'adguard-home';
export type Connection = {
  id: number;
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  hasSecret: boolean;
  hasCa: boolean;
  entityId?: string;
  username?: string;
  slug?: string;
};
export type IntegrationWidget = { id: number; integrationId: number; type: Kind; name: string };
export type ConnectionFormState = {
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  secret: string;
  ca: string;
  removeCa: boolean;
  entityId: string;
  username: string;
  slug: string;
};
export const labels: Record<Kind, string> = {
  jellyfin: 'Jellyfin',
  'home-assistant': 'Home Assistant',
  'uptime-kuma': 'Uptime Kuma',
  'adguard-home': 'AdGuard Home',
};
export const marks: Record<Kind, string> = {
  jellyfin: 'J',
  'home-assistant': 'HA',
  'uptime-kuma': 'UK',
  'adguard-home': 'A',
};
export const emptyForm: ConnectionFormState = {
  type: 'jellyfin',
  name: '',
  url: '',
  allowPrivate: false,
  secret: '',
  ca: '',
  removeCa: false,
  entityId: '',
  username: '',
  slug: '',
};
export async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
    throw new Error(
      typeof message === 'string' ? apiError(message) : t('connections.operationFailed'),
    );
  }
  return data;
}

export function describeData(type: Kind, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' && v.length <= 1024;
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  switch (type) {
    case 'jellyfin':
      return text(data.name) && text(data.version)
        ? t('data.jellyfin', { name: String(data.name), version: String(data.version) })
        : null;
    case 'home-assistant':
      return text(data.entityId) && text(data.state)
        ? t('data.homeAssistant', { entity: String(data.entityId), state: String(data.state) })
        : null;
    case 'uptime-kuma':
      return [data.up, data.down, data.pending, data.maintenance, data.unknown].every(count)
        ? t('data.uptimeKuma', {
            up: Number(data.up),
            down: Number(data.down),
            pending: Number(data.pending),
            maintenance: Number(data.maintenance),
            unknown: Number(data.unknown),
          })
        : null;
    case 'adguard-home':
      return typeof data.running === 'boolean' &&
        typeof data.protectionEnabled === 'boolean' &&
        text(data.version)
        ? t('data.adguard', {
            service: data.running ? t('data.running') : t('data.stopped'),
            protection: data.protectionEnabled ? t('data.enabled') : t('data.disabled'),
            version: String(data.version),
          })
        : null;
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
