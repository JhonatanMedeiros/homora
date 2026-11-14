import { Container, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { SectionSkeleton } from '@/components/skeletons';
import { t } from '@/i18n';
import { ImportPreview } from '@/features/transfer/import-preview';
import { SuggestionList } from './suggestion-list';
import { DiscoveryReviewDialog } from './review-dialog';
import { SkippedContainers } from './skipped-containers';
import { useLocalDiscovery } from '@/hooks/use-local-discovery';

/**
 * Card suggestions from the labels of this host's Docker containers. Nothing is added without
 * review: the user selects containers and confirms, and the server re-queries Docker.
 */
export function LocalDiscovery({ onImported }: { onImported: () => void | Promise<void> }) {
  const { state, selected, setSelected, busy, rescan, review, startReview, items, newCount } =
    useLocalDiscovery(onImported);

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'loading' && <SectionSkeleton label={t('discovery.loading')} />}
      {state.status === 'disabled' && (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Container aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t('discovery.localOffTitle')}</EmptyTitle>
            <EmptyDescription>{t('discovery.localOffHint')}</EmptyDescription>
          </EmptyHeader>
          <p className="max-w-[60ch] text-sm text-muted-foreground">{t('discovery.disabled')}</p>
        </Empty>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t('discovery.scanned', { count: state.found.scanned })}{' '}
              {newCount > 0 && (
                <span className="font-mono text-foreground">
                  · {t('discovery.newCount', { count: newCount })}
                </span>
              )}
            </p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rescan}>
              <RefreshCw data-icon="inline-start" />
              {t('discovery.rescan')}
            </Button>
          </div>
          {items.length === 0 ? (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyTitle>{t('discovery.none')}</EmptyTitle>
                <EmptyDescription>{t('discovery.labelsHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <SuggestionList
              idPrefix="discovery"
              label={t('discovery.list')}
              items={items}
              selected={selected}
              onChange={setSelected}
              disabled={busy}
            />
          )}
          {state.found.plan.issues.length > 0 && (
            <ImportPreview plan={{ ...state.found.plan, services: [] }} />
          )}
          <SkippedContainers
            skipped={state.found.skipped ?? []}
            total={state.found.skippedTotal ?? 0}
          />
          {newCount > 0 && (
            <div>
              <Button type="button" disabled={busy || selected.size === 0} onClick={startReview}>
                {selected.size > 0
                  ? `${t('discovery.review')} (${selected.size})`
                  : t('discovery.review')}
              </Button>
            </div>
          )}
        </>
      )}
      {state.status === 'error' && (
        <div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rescan}>
            <RefreshCw data-icon="inline-start" />
            {t('discovery.rescan')}
          </Button>
        </div>
      )}
      <DiscoveryReviewDialog review={review} />
    </div>
  );
}
