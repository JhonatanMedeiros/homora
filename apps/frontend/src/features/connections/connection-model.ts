import { apiError, t, tOr } from '@/i18n';
import { parseSummary } from '@/lib/coolify';
import { integrationDefinition, integrationDefinitions, type ManifestField } from '@homora/shared';
export type Kind = string;
export type Connection = {
  id: number;
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  hasSecret: boolean;
  hasCa: boolean;
  /** Public fields declared by the integration definition (entityId, username, slug, ...). */
  [field: string]: string | number | boolean | undefined;
};
/** Widget kinds: connection catalog types and Proxmox, which still uses the legacy vault. */
export type WidgetKind = Kind;
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
  /** Public text fields and the token id, by key, as declared by the definition. */
  values: Record<string, string>;
};
export const labels: Record<Kind, string> = Object.fromEntries(
  integrationDefinitions.map(({ type, label }) => [type, label]),
);
export const widgetLabels: Record<WidgetKind, string> = labels;
export const marks: Record<Kind, string> = Object.fromEntries(
  integrationDefinitions.map(({ type, mark }) => [type, mark]),
);
export const emptyForm: ConnectionFormState = {
  type: integrationDefinitions[0]!.type,
  name: '',
  url: '',
  allowPrivate: false,
  secret: '',
  ca: '',
  removeCa: false,
  values: {},
};
/** Form fields beyond the address and the secret, in definition order. */
export const extraFields = (type: Kind): readonly ManifestField[] =>
  integrationDefinition(type)?.fields.filter(
    ({ kind }) => kind === 'text' || kind === 'token-id',
  ) ?? [];
/** A new form for a type, with the definition's default values filled in. */
export function newForm(type: Kind): ConnectionFormState {
  const fields = integrationDefinition(type)?.fields ?? [];
  const url = fields.find(({ kind }) => kind === 'url')?.defaultValue ?? '';
  return {
    ...emptyForm,
    type,
    url,
    values: Object.fromEntries(
      fields
        .filter(({ kind, defaultValue }) => kind !== 'url' && defaultValue !== undefined)
        .map(({ key, defaultValue }) => [key, defaultValue!]),
    ),
  };
}
export const urlField = (type: Kind) =>
  integrationDefinition(type)?.fields.find(({ kind }) => kind === 'url');
export const secretField = (type: Kind) =>
  integrationDefinition(type)?.fields.find(({ kind }) => kind === 'secret');
/** Only public fields from an approved suggestion can prefill this form. */
export function connectionDraft(value: unknown): ConnectionFormState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.type !== 'string' ||
    !Object.hasOwn(labels, input.type) ||
    typeof input.name !== 'string' ||
    typeof input.url !== 'string'
  )
    return null;
  try {
    const url = new URL(input.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
  } catch {
    return null;
  }
  return {
    ...emptyForm,
    type: input.type as Kind,
    name: input.name.slice(0, 80),
    url: input.url.slice(0, 2048),
    values: Object.fromEntries(
      extraFields(input.type)
        .filter(({ kind }) => kind === 'text')
        .map(({ key }) => [key, typeof input[key] === 'string' ? input[key].slice(0, 255) : '']),
    ),
  };
}
export function proxmoxDraft(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.type !== 'proxmox' || typeof input.url !== 'string' || input.url.length > 2048)
    return null;
  try {
    const url = new URL(input.url);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiError(data, t('connections.operationFailed')));
  }
  return data;
}

/** A value the display may show: bounded text, a boolean or a non-negative finite number. */
function displayable(value: unknown): value is string | number | boolean {
  if (typeof value === 'string') return value.length <= 1024;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  return typeof value === 'boolean';
}

/** Renders a manifest display over validated output; null when the data is not displayable. */
function renderManifest(type: WidgetKind, value: unknown) {
  const definition = integrationDefinition(type);
  if (definition?.kind !== 'manifest') return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const { display } = definition;
  const names = new Map<string, string>();
  const read = (name: string) => {
    const spec = display.values?.[name];
    const raw = data[spec?.from ?? name];
    if (!displayable(raw)) return null;
    if (spec?.map) {
      const entry = spec.map[String(raw)];
      return entry ? tOr(entry.key, entry.text) : null;
    }
    return String(raw);
  };
  const fill = (template: string) => {
    let missing = false;
    const text = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
      if (!names.has(name)) {
        const resolved = read(name);
        if (resolved === null) missing = true;
        names.set(name, resolved ?? '');
      }
      return names.get(name)!;
    });
    return missing ? null : text;
  };
  const params: Record<string, string> = {};
  for (const match of display.summary.text.matchAll(/\{(\w+)\}/g)) {
    const resolved = read(match[1]!);
    if (resolved === null) return null;
    params[match[1]!] = resolved;
  }
  const summary = tOr(display.summary.key, display.summary.text, params);
  const stats: WidgetStat[] = [];
  for (const stat of display.stats) {
    if (stat.hideWhenZero !== undefined && data[stat.hideWhenZero] === 0) continue;
    const text = fill(stat.value);
    if (text === null) return null;
    stats.push({ label: tOr(stat.labelKey, stat.label), value: text });
  }
  return { summary, stats };
}

export function describeData(type: WidgetKind, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (type === 'proxmox' || type === 'coolify')
    return (
      widgetStats(type, value)
        ?.map((stat) => `${stat.label}: ${stat.value}`)
        .join(' · ') ?? null
    );
  return renderManifest(type, value)?.summary ?? null;
}

/** Coolify counts. Unknown is its own number: a state Homora cannot read is never "offline". */
function coolifyStats(value: unknown): WidgetStat[] | null {
  const summary = parseSummary(value);
  if (!summary) return null;
  const stats: WidgetStat[] = [
    { label: t('coolify.stat.total'), value: String(summary.total) },
    { label: t('coolify.stat.running'), value: String(summary.running) },
  ];
  if (summary.degraded > 0)
    stats.push({ label: t('coolify.stat.degraded'), value: String(summary.degraded) });
  if (summary.stopped > 0)
    stats.push({ label: t('coolify.stat.stopped'), value: String(summary.stopped) });
  if (summary.unknown > 0)
    stats.push({ label: t('coolify.stat.unknown'), value: String(summary.unknown) });
  return stats;
}

/** Short numbers and text from a query, for display within a card. */
export function widgetStats(type: WidgetKind, value: unknown): WidgetStat[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (type === 'coolify') return coolifyStats(value);
  if (type !== 'proxmox') return renderManifest(type, value)?.stats ?? null;
  const data = value as Record<string, unknown>;
  // A selected node that is missing or offline: say so, never show the cluster totals.
  if (data.unavailable === true)
    return [{ label: t('stat.node'), value: t('stat.nodeUnavailable') }];
  const count = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const group = (v: unknown): v is { running: number; total: number } =>
    !!v &&
    typeof v === 'object' &&
    count((v as Record<string, unknown>).running) &&
    count((v as Record<string, unknown>).total);
  const share = (v: unknown): v is number | null =>
    v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);
  if (!group(data.vms) || !group(data.containers) || !share(data.cpu) || !share(data.memory))
    return null;
  // Responses from older versions lacked disk metric; treat as absent.
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

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
