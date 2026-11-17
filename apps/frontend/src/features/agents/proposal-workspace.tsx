import type { ReactNode } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@homora/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { t } from '@/i18n';
import type { Proposal, Service } from './agent-model';
import { ReviewInbox } from './review-inbox';

export function ProposalWorkspace({
  proposalsLoaded,
  pending,
  expired,
  history,
  reviewing,
  now,
  agentName,
  serviceFor,
  onReview,
  onApproveMany,
  renderProposal,
  renderBatchItem,
  renderRow,
}: {
  proposalsLoaded: boolean;
  pending: Proposal[];
  expired: Proposal[];
  history: Proposal[];
  /** The id being decided, if any: every decision button waits for it. */
  reviewing?: string | null;
  now?: number;
  agentName: (id: string) => string;
  serviceFor: (proposal: Proposal) => Service | undefined;
  onReview: (id: string, approve: boolean, batch?: boolean) => void;
  onApproveMany: (ids: string[]) => void;
  renderProposal: (proposal: Proposal) => ReactNode;
  renderBatchItem: (proposal: Proposal, open: boolean) => ReactNode;
  renderRow: (proposal: Proposal) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!proposalsLoaded ? (
        <RowListSkeleton label={t('common.loading')} rows={2} />
      ) : pending.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 />
            </EmptyMedia>
            <EmptyTitle>{t('agents.nothingWaiting')}</EmptyTitle>
            <EmptyDescription>{t('agents.nothingWaitingHint')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ReviewInbox
          pending={pending}
          reviewing={reviewing}
          now={now}
          agentName={agentName}
          serviceFor={serviceFor}
          onReview={onReview}
          onApproveMany={onApproveMany}
          renderProposal={renderProposal}
          renderBatchItem={renderBatchItem}
        />
      )}
      {expired.length > 0 && (
        <Collapsible className="flex flex-col gap-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group w-fit">
              {t('agents.expired', { count: expired.length })}
              <ChevronDown
                data-icon="inline-end"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t('agents.expiredHint')}</p>
            <ul className="flex flex-col gap-2">
              {expired.map((proposal) => renderRow(proposal))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {history.length > 0 && (
        <Collapsible className="flex flex-col gap-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group w-fit">
              {t('agents.history', { count: history.length })}
              <ChevronDown
                data-icon="inline-end"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-2">
              {history.map((proposal) => renderRow(proposal))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
