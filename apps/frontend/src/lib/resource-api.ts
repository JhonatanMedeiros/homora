import type { Service } from '@homora/shared';
import { t } from '@/i18n';
import { requestJson } from '@/lib/api';
import type { ResourceType } from '@homora/integrations';

const json = { 'Content-Type': 'application/json' };

const send = (url: string, init: RequestInit) =>
  requestJson(url, t('connections.operationFailed'), init);

export type LinkTarget = {
  integrationId: number;
  resourceUuid: string;
  resourceType: ResourceType;
  /** Values the user reviewed; a later difference is flagged, never applied on its own. */
  name: string;
  url: string | null;
};

export const putLink = (serviceId: number, target: LinkTarget) =>
  send(`/api/services/${serviceId}/resource-link`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify(target),
  });

export const deleteLink = (serviceId: number) =>
  send(`/api/services/${serviceId}/resource-link`, { method: 'DELETE' });

export type NewCard = {
  name: string;
  url: string;
  category: string;
  description?: string;
  icon?: string;
  /** Discovered data never enables private-address monitoring unless the user ticks it. */
  allowPrivate: boolean;
};

/** Creates a card; the response carries its id. */
export async function createCard(card: NewCard): Promise<number> {
  const body = await send('/api/services', {
    method: 'POST',
    headers: json,
    body: JSON.stringify(card),
  });
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') throw new TypeError(t('connections.operationFailed'));
  return id;
}

/**
 * Applies a reviewed name and address to an existing card (explicit user action only). The rest of
 * the card is sent back unchanged; the host link is omitted, which leaves it as it is.
 */
export function updateCard(service: Service, change: { name: string; url: string }) {
  const keys = [
    'description',
    'icon',
    'category',
    'allowPrivate',
    'checkInsecure',
    'checkType',
    'expectedStatus',
    'checkPath',
    'checkUrl',
    'checkMatch',
    'checkInterval',
  ] as const;
  const body: Record<string, unknown> = { ...change };
  for (const key of keys) if (service[key] !== undefined) body[key] = service[key];
  return send(`/api/services/${service.id}`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify(body),
  });
}
