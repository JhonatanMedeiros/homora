import { isHttpUrl } from '@homora/integrations/resources/client';
import { t } from '@/i18n';
import type { IntegrationResource } from '@homora/integrations';

export const MANUAL = '__manual__';
export const NEW_GROUP = '__new__';
export type Row = {
  resource: IntegrationResource;
  include: boolean;
  mode: 'create' | 'link';
  linkCard: string;
  name: string;
  urlChoice: string;
  manualUrl: string;
  group: string;
  newGroup: string;
  description: string;
  icon: string;
  allowPrivate: boolean;
  /** Set once the card exists, so a retry after a failed link does not create a second card. */
  createdId?: number;
  outcome?: { ok: true } | { ok: false; message: string };
};

export const addressOf = (row: Row) =>
  (row.urlChoice === MANUAL ? row.manualUrl : row.urlChoice).trim();
export const groupOf = (row: Row) => (row.group === NEW_GROUP ? row.newGroup : row.group).trim();

/** Why a row cannot be saved yet; null when it is ready. */
export function problem(row: Row): string | null {
  if (!row.include || row.outcome?.ok) return null;
  if (row.mode === 'link') return row.linkCard ? null : t('resources.problemCard');
  if (!row.name.trim()) return t('resources.problemName');
  if (!isHttpUrl(addressOf(row))) return t('resources.problemUrl');
  if (!groupOf(row) || groupOf(row).length > 40) return t('resources.problemGroup');
  return null;
}
