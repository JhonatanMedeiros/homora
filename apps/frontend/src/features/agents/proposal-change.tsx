import { ArrowRight } from 'lucide-react';
import type { Service } from '@homora/shared';
import { cn } from '@/lib/utils';
import { FIELDS, type Diff } from './agent-model';
import { t } from '@/i18n';

/** Mudança proposta em linguagem clara: título da operação e campo a campo, antes e depois. */
export function ProposalChange({ diff, current }: { diff: Diff; current?: Service }) {
  const name = diff.service?.name ?? current?.name;
  const fallback = t('proposal.serviceNumber', { id: diff.id ?? '' });
  const title =
    diff.op === 'create'
      ? t('proposal.add', { name: name ?? t('proposal.newService') })
      : diff.op === 'update'
        ? t('proposal.update', { name: current?.name ?? name ?? fallback })
        : diff.op === 'delete'
          ? t('proposal.remove', { name: current?.name ?? fallback })
          : t('proposal.unknown');
  const after = diff.service;
  const rows = FIELDS.map(([key, label]) => {
    const before = current?.[key as keyof Service] as string | undefined;
    const next = after?.[key];
    return { key, label: t(label), before: before || '', next: next || '' };
  });
  const changed = rows.filter((row) =>
    diff.op === 'update' ? row.next !== row.before : diff.op === 'create' ? row.next : row.before,
  );
  const unchanged =
    diff.op === 'update' ? rows.filter((row) => row.next === row.before && row.before).length : 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-label text-lg font-semibold">{title}</p>
      {diff.op === 'delete' && !current && (
        <p className="text-sm text-muted-foreground">{t('proposal.gone')}</p>
      )}
      {changed.length > 0 && (
        <dl className="flex flex-col gap-3">
          {changed.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <dt className="font-label text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {row.label}
              </dt>
              {diff.op === 'update' ? (
                <dd className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <span className="flex min-w-0 flex-col rounded-md border bg-muted px-3 py-2 break-words">
                    <small className="text-xs text-muted-foreground">{t('proposal.before')}</small>
                    {row.before || t('proposal.empty')}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden size-4 text-muted-foreground sm:block"
                  />
                  <span className="flex min-w-0 flex-col rounded-md border border-primary bg-card px-3 py-2 break-words">
                    <small className="text-xs text-muted-foreground">{t('proposal.after')}</small>
                    {row.next || t('proposal.empty')}
                  </span>
                </dd>
              ) : (
                <dd
                  className={cn(
                    'rounded-md border px-3 py-2 break-words',
                    diff.op === 'delete' ? 'bg-muted line-through' : 'border-primary bg-card',
                  )}
                >
                  {diff.op === 'delete' ? row.before : row.next}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {unchanged > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('proposal.unchanged', { count: unchanged })}
        </p>
      )}
    </div>
  );
}
