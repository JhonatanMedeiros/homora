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
/** Tipos que um widget pode ter: as conexões e o Proxmox, que ainda usa o cofre legado. */
export type WidgetKind = Kind | 'proxmox';
export type IntegrationWidget = {
  id: number;
  integrationId: number;
  type: WidgetKind;
  name: string;
  serviceId: number | null;
};
export type WidgetStat = { label: string; value: string; id?: 'cpu' | 'memory' | 'disk' };
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
export const widgetLabels: Record<WidgetKind, string> = { ...labels, proxmox: 'Proxmox VE' };
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
    throw new Error(apiError(data, t('connections.operationFailed')));
  }
  return data;
}

export function describeData(type: WidgetKind, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' && v.length <= 1024;
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  switch (type) {
    case 'proxmox':
      return (
        widgetStats(type, value)
          ?.map((stat) => `${stat.label}: ${stat.value}`)
          .join(' · ') ?? null
      );
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

/** Números e textos curtos de uma consulta, para exibir dentro de um card. */
export function widgetStats(type: WidgetKind, value: unknown): WidgetStat[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 1024;
  const count = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  switch (type) {
    case 'proxmox': {
      const group = (v: unknown): v is { running: number; total: number } =>
        !!v &&
        typeof v === 'object' &&
        count((v as Record<string, unknown>).running) &&
        count((v as Record<string, unknown>).total);
      const share = (v: unknown): v is number | null =>
        v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);
      if (!group(data.vms) || !group(data.containers) || !share(data.cpu) || !share(data.memory))
        return null;
      // Respostas de versões anteriores não tinham o disco; tratar como ausente.
      const disk = data.disk === undefined ? null : data.disk;
      if (!share(disk)) return null;
      const stats: WidgetStat[] = [
        { label: t('stat.vms'), value: `${data.vms.running} / ${data.vms.total}` },
        { label: t('stat.lxc'), value: `${data.containers.running} / ${data.containers.total}` },
      ];
      if (data.cpu !== null) stats.push({ id: 'cpu', label: t('stat.cpu'), value: `${data.cpu}%` });
      if (data.memory !== null)
        stats.push({ id: 'memory', label: t('stat.memory'), value: `${data.memory}%` });
      if (disk !== null) stats.push({ id: 'disk', label: t('stat.disk'), value: `${disk}%` });
      return stats;
    }
    case 'jellyfin':
      return text(data.name) && text(data.version)
        ? [
            { label: t('stat.server'), value: data.name },
            { label: t('stat.version'), value: data.version },
          ]
        : null;
    case 'home-assistant':
      return text(data.entityId) && text(data.state)
        ? [{ label: t('stat.state'), value: data.state }]
        : null;
    case 'uptime-kuma': {
      const { up, down, pending, maintenance, unknown } = data;
      if (!count(up) || !count(down) || !count(pending) || !count(maintenance) || !count(unknown))
        return null;
      const stats = [
        { label: t('stat.up'), value: String(up) },
        { label: t('stat.down'), value: String(down) },
      ];
      if (pending) stats.push({ label: t('stat.pending'), value: String(pending) });
      if (maintenance) stats.push({ label: t('stat.maintenance'), value: String(maintenance) });
      if (unknown) stats.push({ label: t('stat.unknown'), value: String(unknown) });
      return stats;
    }
    case 'adguard-home':
      return typeof data.running === 'boolean' &&
        typeof data.protectionEnabled === 'boolean' &&
        text(data.version)
        ? [
            {
              label: t('stat.service'),
              value: data.running ? t('data.running') : t('data.stopped'),
            },
            {
              label: t('stat.protection'),
              value: data.protectionEnabled ? t('data.enabled') : t('data.disabled'),
            },
            { label: t('stat.version'), value: data.version },
          ]
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
