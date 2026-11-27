import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homora/ui/card';
import { ServiceDetails, type ServiceDetailsProps } from '@/components/service-details';
import { ProposalsCard } from '@/features/home/proposals-card';
import { ServiceWindows, type Window } from '@/features/home/service-windows';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import { hostOf } from '@/lib/services';
import type { Service } from '@homora/shared';
import { t } from '@/i18n';

type Props = {
  windows: Window[];
  /** The details shown below the grid; null while there is nothing to select. */
  details: (Omit<ServiceDetailsProps, 'service'> & { service: Service }) | null;
  onSelect: (id: number) => void;
  onReviewProposals: () => void;
  /** False hides the details card, when something else takes its place. */
  showDetails?: boolean;
  /** Shown first in the column, such as the page widgets. */
  top?: ReactNode;
  /** The way back from the details to what they replaced. */
  onBack?: () => void;
};

/**
 * The right column of wide screens: one window per service, lit by its state, and the details of
 * the one selected.
 */
export function ServicePanel({
  windows,
  details,
  onSelect,
  onReviewProposals,
  showDetails = true,
  top,
  onBack,
}: Props) {
  const pending = usePendingProposals('panel', true);
  return (
    <div data-homora="service-panel" className="flex min-w-0 flex-col gap-4">
      {top}
      {!onBack && (
        <ServiceWindows windows={windows} selectedId={details?.service.id} onSelect={onSelect} />
      )}
      {showDetails && (
        <section aria-label={t('panel.label')}>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-2 pointer-coarse:min-h-11"
              onClick={onBack}
            >
              <ArrowLeft />
              {t('summarygrid.services.back')}
            </Button>
          )}
          <Card className="gap-3">
            {details ? (
              <>
                <CardHeader>
                  <CardTitle>
                    <h2 className="text-base break-words">{details.service.name}</h2>
                  </CardTitle>
                  <CardDescription className="font-mono text-xs break-all">
                    {hostOf(details.service.url)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ServiceDetails key={details.service.id} {...details} />
                </CardContent>
              </>
            ) : (
              <CardContent>
                <p className="text-sm text-muted-foreground">{t('panel.empty')}</p>
              </CardContent>
            )}
          </Card>
        </section>
      )}
      {onBack && (
        <ServiceWindows windows={windows} selectedId={details?.service.id} onSelect={onSelect} />
      )}
      {pending > 0 && <ProposalsCard pending={pending} onReview={onReviewProposals} />}
    </div>
  );
}
