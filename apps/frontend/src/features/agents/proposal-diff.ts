import type { Service } from '@homora/shared';
import { t } from '@/i18n';
import { FIELDS, type Diff } from './agent-model';

export type Row = { key: string; label: string; before: string; next: string };

/** The fields a service proposal changes, with their current and proposed values. */
export function diffRows(diff: Diff, current?: Service) {
  const after = diff.service;
  const rows: Row[] = FIELDS.map(([key, label]) => {
    const before = current?.[key as keyof Service];
    const next = after?.[key];
    return {
      key,
      label: t(label),
      before: before == null ? '' : String(before),
      next: next == null ? '' : String(next),
    };
  });
  if (diff.op === 'create' && diff.page)
    rows.push({ key: 'page', label: t('diff.page'), before: '', next: diff.page });
  const changed = rows.filter((row) =>
    diff.op === 'update' ? row.next !== row.before : diff.op === 'create' ? row.next : row.before,
  );
  const unchanged =
    diff.op === 'update' ? rows.filter((row) => row.next === row.before && row.before).length : 0;
  return { changed, unchanged };
}

/** Names of the fields a proposal changes, for the summary chips. */
export const changedFieldLabels = (diff: Diff, current?: Service) =>
  diff.kind === 'agent' || diff.kind === 'managed'
    ? []
    : diffRows(diff, current).changed.map((row) => row.label);
