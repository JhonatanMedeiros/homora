import { apiError, t, tOr } from '@/i18n';
import { customPresentations } from './presentations';
import { renderManifestDisplay, type WidgetStat } from '@homora/integrations/frontend';
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
export type { WidgetStat } from '@homora/integrations/frontend';
export type CardRef = { id: number; name: string; url: string };
export type GroupRef = { id: number; name: string };
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

function renderManifest(type: WidgetKind, value: unknown) {
  const definition = integrationDefinition(type);
  return definition?.kind === 'manifest'
    ? renderManifestDisplay(definition.display, value, tOr)
    : null;
}

export function describeData(type: WidgetKind, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.hasOwn(customPresentations, type))
    return (
      widgetStats(type, value)
        ?.map((stat) => `${stat.label}: ${stat.value}`)
        .join(' · ') ?? null
    );
  return renderManifest(type, value)?.summary ?? null;
}

/** Short numbers and text from a query, for display within a card. */
export function widgetStats(type: WidgetKind, value: unknown): WidgetStat[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const presentation = Object.hasOwn(customPresentations, type) ? customPresentations[type] : null;
  return presentation ? presentation.stats(value) : (renderManifest(type, value)?.stats ?? null);
}

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
