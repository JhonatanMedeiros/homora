import { hostOf, isRecord, parseHttpUrl } from '@homora/utils';
import { t, tOr, type MessageKey } from '@/i18n';
import { requestJson } from '@/lib/api';
import { createWidgetRenderer } from '@homora/integrations/frontend/catalog';
import {
  integrationDefinition,
  integrationDefinitions,
  type ManifestField,
} from '@homora/integrations';
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
  /** Name of the file `ca` was read from, for display only. */
  caName: string;
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
  caName: '',
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
/** A URL whose host is a private IPv4 literal can only work with explicit consent, so the form proposes it. */
function isPrivateIpv4Literal(value: string): boolean {
  try {
    const parts = new URL(value).hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
      return false;
    const [a, b] = parts as [number, number];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  } catch {
    return false;
  }
}
/** Only public fields from an approved suggestion can prefill this form. */
export function connectionDraft(value: unknown): ConnectionFormState | null {
  if (!isRecord(value)) return null;
  const input = value;
  if (
    typeof input.type !== 'string' ||
    !Object.hasOwn(labels, input.type) ||
    typeof input.name !== 'string' ||
    typeof input.url !== 'string' ||
    !parseHttpUrl(input.url, { allowQuery: false, allowHash: false })
  )
    return null;
  return {
    ...emptyForm,
    type: input.type as Kind,
    name: input.name.slice(0, 80),
    url: input.url.slice(0, 2048),
    allowPrivate: input.allowPrivate === true || isPrivateIpv4Literal(input.url),
    values: Object.fromEntries(
      extraFields(input.type)
        .filter(({ kind }) => kind === 'text')
        .map(({ key }) => [key, typeof input[key] === 'string' ? input[key].slice(0, 255) : '']),
    ),
  };
}
export const request = (url: string, init?: RequestInit): Promise<unknown> =>
  requestJson(url, t('connections.operationFailed'), init);

export const describeData = widgets.describe;
export const widgetStats = widgets.stats;

export type Health = 'ok' | 'failed' | 'untested';
export const healthOf = (item: Pick<Connection, 'lastTest'>): Health =>
  item.lastTest ? (item.lastTest.result === 'ok' ? 'ok' : 'failed') : 'untested';

const REASONS: Record<string, MessageKey> = {
  rejected: 'connections.reason.rejected',
  'http-error': 'connections.reason.http-error',
  timeout: 'connections.reason.timeout',
  unavailable: 'connections.reason.unavailable',
  'invalid-response': 'connections.reason.invalid-response',
  'private-network': 'connections.reason.private-network',
};
/** Message for the reason code of a failed test; unknown codes read as a generic failure. */
export const reasonKey = (result: string): MessageKey =>
  REASONS[result] ?? 'connections.reason.failed';

export { hostOf };
