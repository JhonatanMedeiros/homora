import { apiError, t, tOr, type MessageKey } from '@/i18n';
import { createWidgetRenderer } from '@homora/integrations/frontend/catalog';
import { integrationDefinition, integrationDefinitions, type ManifestField } from '@homora/shared';
const widgets = createWidgetRenderer(tOr);
export type Kind = string;
export type LastTest = { at: number; result: string };
export type Connection = {
  id: number;
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  hasSecret: boolean;
  hasCa: boolean;
  /** Result of the last explicit test; null until the connection is tested. */
  lastTest?: LastTest | null;
  /** Public fields declared by the integration definition (entityId, username, slug, ...). */
  [field: string]: string | number | boolean | LastTest | null | undefined;
};
/** Widget types are supplied by the integration catalog. */
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
export async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiError(data, t('connections.operationFailed')));
  }
  return data;
}

export const describeData = widgets.describe;
export const widgetStats = widgets.stats;

export type Health = 'ok' | 'failed' | 'untested';
export const healthOf = (item: Pick<Connection, 'lastTest'>): Health =>
  !item.lastTest ? 'untested' : item.lastTest.result === 'ok' ? 'ok' : 'failed';

const REASONS: Record<string, MessageKey> = {
  rejected: 'connections.reason.rejected',
  'http-error': 'connections.reason.http-error',
  timeout: 'connections.reason.timeout',
  unavailable: 'connections.reason.unavailable',
  'invalid-response': 'connections.reason.invalid-response',
};
/** Message for the reason code of a failed test; unknown codes read as a generic failure. */
export const reasonKey = (result: string): MessageKey =>
  REASONS[result] ?? 'connections.reason.failed';

export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
