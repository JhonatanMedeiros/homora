import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { ActivitySkeleton } from '@/components/skeletons';
import { EmptyNote } from '@/components/empty-note';
import { FormError } from '@/components/form-error';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { PageHeader } from '@/components/page-header';
import { ActivityFeed } from '@/features/activity/activity-feed';
import type { ActivityKind, ActivityOutcome } from '@/features/activity/activity-model';
import { useActivityFeed } from '@/hooks/use-activity-feed';
import { t } from '@/i18n';

const KINDS: ('all' | ActivityKind)[] = ['all', 'access', 'account', 'proposal', 'agent'];
const OUTCOMES: ('all' | ActivityOutcome)[] = ['all', 'success', 'failure', 'refused'];

export function ActivityPage() {
  const [kind, setKind] = useState<'all' | ActivityKind>('all');
  const [outcome, setOutcome] = useState<'all' | ActivityOutcome>('all');
  const { events, next, failed, loadingMore, loadMore } = useActivityFeed(kind, outcome);

  return (
    <section aria-label={t('activity.title')} className="flex flex-col gap-6">
      <PageHeader title={t('activity.title')} description={t('activity.description')} />
      <div className="flex flex-wrap items-end gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(value) => value && setKind(value as 'all' | ActivityKind)}
          aria-label={t('activity.kindLabel')}
          className="max-w-full overflow-x-auto"
        >
          {KINDS.map((item) => (
            <ToggleGroupItem key={item} value={item} className="px-3">
              {t(`activity.kind.${item}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Field className="w-full sm:ml-auto sm:w-52">
          <FieldLabel htmlFor="activity-outcome">{t('activity.result')}</FieldLabel>
          <FormSelect
            id="activity-outcome"
            aria-label={t('activity.result')}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as 'all' | ActivityOutcome)}
          >
            {OUTCOMES.map((item) => (
              <FormSelectOption key={item} value={item}>
                {item === 'all' ? t('activity.result.all') : t(`activity.outcome.${item}`)}
              </FormSelectOption>
            ))}
          </FormSelect>
        </Field>
      </div>
      <FormError>{failed ? t('activity.loadFailed') : ''}</FormError>
      {events === null ? (
        !failed && <ActivitySkeleton label={t('common.loading')} />
      ) : events.length === 0 ? (
        <EmptyNote>
          {kind === 'all' && outcome === 'all' ? t('activity.empty') : t('activity.emptyFiltered')}
        </EmptyNote>
      ) : (
        <>
          <ActivityFeed events={events} />
          {next !== null && (
            <div>
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {t('activity.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
      <p className="text-sm text-muted-foreground">{t('activity.retention')}</p>
    </section>
  );
}
