import { Badge } from '@homora/ui/badge';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Field, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Spinner } from '@homora/ui/spinner';
import { t, type MessageKey } from '@/i18n';
import type { DiscoveryReview } from '@/hooks/use-discovery-review';
import type { ReviewField, ReviewResult } from './review-model';
import { PrivateOption } from './suggestion-list';

const FIELDS: { field: ReviewField; label: MessageKey; max: number; wide?: boolean }[] = [
  { field: 'name', label: 'discovery.field.name', max: 80 },
  { field: 'group', label: 'discovery.field.group', max: 40 },
  { field: 'url', label: 'discovery.field.url', max: 2048, wide: true },
];

const statusBadge = (status: ReviewResult['status'], done: boolean) => {
  if (status === 'created')
    return {
      variant: 'success',
      label: t(done ? 'discovery.result.created' : 'discovery.result.willCreate'),
    } as const;
  if (status === 'duplicate')
    return { variant: 'secondary', label: t('discovery.result.duplicate') } as const;
  if (status === 'rejected')
    return { variant: 'destructive', label: t('discovery.result.rejected') } as const;
  return { variant: 'destructive', label: t('discovery.result.missing') } as const;
};

const issueText = (code: string | undefined) =>
  code ? t(`transfer.issue.${code}` as MessageKey) : '';

/**
 * Last step before cards exist: edit name, group and address, see what each row would do, choose
 * private monitoring explicitly, then confirm. Afterwards the same rows show the outcome.
 */
export function DiscoveryReviewDialog({ review }: { review: DiscoveryReview }) {
  const { items, evaluation, outcome } = review;
  const done = outcome !== null;
  const results = new Map((outcome ?? evaluation?.results ?? []).map((item) => [item.id, item]));
  const counts = { created: 0, duplicates: 0, invalid: 0 };
  for (const item of results.values()) {
    if (item.status === 'created') counts.created += 1;
    else if (item.status === 'duplicate') counts.duplicates += 1;
    else counts.invalid += 1;
  }
  return (
    <Dialog
      open={items !== null}
      onOpenChange={(open) => {
        if (!open && !review.busy) review.close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(done ? 'discovery.doneTitle' : 'discovery.reviewTitle')}</DialogTitle>
          <DialogDescription>
            {done
              ? t('discovery.done', {
                  created: counts.created,
                  other: counts.duplicates + counts.invalid,
                })
              : t('discovery.reviewHint')}
          </DialogDescription>
        </DialogHeader>
        {!done && <p className="text-sm text-muted-foreground">{t('discovery.addressHint')}</p>}
        {review.notice && (
          <Alert variant="destructive">
            <AlertDescription>{review.notice}</AlertDescription>
          </Alert>
        )}
        <ul aria-label={t('discovery.reviewList')} className="flex flex-col gap-3">
          {items?.map((item) => {
            const result = results.get(item.id);
            const badge = result ? statusBadge(result.status, done) : null;
            const problem = result?.status === 'rejected' ? issueText(result.code) : '';
            const url = review.edits[item.id]?.url ?? item.url;
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-3"
                aria-busy={review.checking}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm break-words text-muted-foreground">
                    {t('discovery.container', { name: item.container ?? item.id })}
                  </span>
                  {badge ? (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  ) : (
                    <Badge variant="outline">{t('discovery.checking')}</Badge>
                  )}
                </div>
                {!done && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FIELDS.map(({ field, label, max, wide }) => {
                      const id = `review-${item.id}-${field}`;
                      return (
                        <Field key={field} className={wide ? 'sm:col-span-2' : undefined}>
                          <FieldLabel htmlFor={id}>{t(label)}</FieldLabel>
                          <Input
                            id={id}
                            value={review.edits[item.id]?.[field] ?? item[field] ?? ''}
                            maxLength={max}
                            inputMode={field === 'url' ? 'url' : undefined}
                            spellCheck={false}
                            autoComplete="off"
                            disabled={review.busy}
                            aria-invalid={field === 'url' && problem ? true : undefined}
                            aria-describedby={`review-${item.id}-info`}
                            className={field === 'url' ? 'font-mono' : undefined}
                            onChange={(event) => review.edit(item.id, field, event.target.value)}
                          />
                        </Field>
                      );
                    })}
                  </div>
                )}
                {done && <p className="font-mono text-xs break-all text-muted-foreground">{url}</p>}
                <div
                  id={`review-${item.id}-info`}
                  className="flex flex-col gap-1 text-sm empty:hidden"
                >
                  {problem && <p className="text-destructive">{problem}</p>}
                  {!problem && result?.status === 'duplicate' && (
                    <p className="text-muted-foreground">{t('transfer.statusDuplicate')}</p>
                  )}
                  {result?.status === 'missing' && (
                    <p className="text-destructive">{t('discovery.result.missing')}</p>
                  )}
                  {item.note && !done && (
                    <p className="text-muted-foreground">{t(`discovery.note.${item.note}`)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!done && evaluation && (
          <>
            <p role="status" className="text-sm font-medium">
              {t('discovery.summary', counts)}
            </p>
            {review.creatable > 0 && (
              <PrivateOption
                id="review-private"
                checked={review.allowPrivate}
                onChange={review.setAllowPrivate}
              />
            )}
          </>
        )}
        <DialogFooter>
          {done ? (
            <Button type="button" onClick={review.close}>
              {t('discovery.close')}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" disabled={review.busy} onClick={review.close}>
                {t('discovery.cancel')}
              </Button>
              <Button
                type="button"
                disabled={review.busy || review.checking || review.creatable === 0}
                onClick={() => void review.confirm()}
              >
                {(review.busy || review.checking) && <Spinner data-icon="inline-start" />}
                {t('discovery.confirm', { count: review.creatable })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
