import type { Service } from '@homora/shared';
import { cn } from '@homora/ui/lib/utils';
import { textDiff, type TextDiff } from './proposal-text-diff';
import type { Diff } from './agent-model';
import { diffRows } from './proposal-diff';
import { t } from '@/i18n';

/** One side of a field change: removed values are struck through, added ones are highlighted. */
function DiffLine({
  kind,
  label,
  value,
  part,
}: {
  kind: 'add' | 'del';
  label: string;
  value: string;
  part?: TextDiff | null;
}) {
  const shown = value || t('proposal.empty');
  return (
    <span
      className={cn(
        'flex min-w-0 items-baseline gap-2 rounded-md px-3 py-1.5 break-words',
        kind === 'add' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      )}
    >
      <span aria-hidden="true" className="w-3 shrink-0">
        {kind === 'add' ? '+' : '−'}
      </span>
      <span className="sr-only">{label}:</span>
      <span className={cn('min-w-0 break-all', kind === 'del' && 'line-through')}>
        {part ? (
          <>
            {part.prefix}
            <strong className="font-semibold">{kind === 'add' ? part.after : part.before}</strong>
            {part.suffix}
          </>
        ) : (
          shown
        )}
      </span>
    </span>
  );
}

/** Proposed change in clear language: operation title and field-by-field before and after. */
export function ProposalChange({
  diff,
  current,
  hideTitle = false,
}: {
  diff: Diff;
  current?: Service;
  /** The card above already names the change. */
  hideTitle?: boolean;
}) {
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
  const { changed, unchanged } = diffRows(diff, current);
  return (
    <div className="flex flex-col gap-3">
      {!hideTitle && <p className="font-label text-lg font-semibold">{title}</p>}
      {diff.op === 'delete' && !current && (
        <p className="text-sm text-muted-foreground">{t('proposal.gone')}</p>
      )}
      {changed.length > 0 && (
        <dl className="flex flex-col gap-3">
          {changed.map((row) => (
            <div key={row.key} className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
              <dt className="font-mono text-xs text-muted-foreground sm:pt-2">{row.label}</dt>
              <dd className="flex min-w-0 flex-col gap-1 font-mono text-sm">
                {diff.op === 'create' ? (
                  <DiffLine kind="add" label={t('proposal.after')} value={row.next} />
                ) : diff.op === 'delete' ? (
                  <DiffLine kind="del" label={t('proposal.before')} value={row.before} />
                ) : (
                  <>
                    <DiffLine
                      kind="del"
                      label={t('proposal.before')}
                      value={row.before}
                      part={textDiff(row.before, row.next)}
                    />
                    <DiffLine
                      kind="add"
                      label={t('proposal.after')}
                      value={row.next}
                      part={textDiff(row.before, row.next)}
                    />
                  </>
                )}
              </dd>
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
