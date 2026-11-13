import type { ReactNode } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { t } from '@/i18n';
import type { Proposal } from './agent-model';

export function ProposalWorkspace({
  proposalsLoaded,
  pending,
  expired,
  history,
  onReview,
  renderProposal,
  renderBatchItem,
  renderRow,
}: {
  proposalsLoaded: boolean;
  pending: Proposal[];
  expired: Proposal[];
  history: Proposal[];
  onReview: (id: string, approve: boolean, batch?: boolean) => void;
  /** `open` tells whether the changes start visible: a short queue is shown in full. */
  renderProposal: (proposal: Proposal, open: boolean) => ReactNode;
  renderBatchItem: (proposal: Proposal, open: boolean) => ReactNode;
  renderRow: (proposal: Proposal) => ReactNode;
}) {
  // With a short queue every change is on screen, so nothing is approved without being seen.
  const open = pending.length <= 3;
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
        <ul className="flex flex-col gap-3">
          {pending.map((proposal, index) => {
            if (!proposal.batchId) return renderProposal(proposal, open);
            if (pending.findIndex((item) => item.batchId === proposal.batchId) !== index)
              return null;
            const batch = pending.filter((item) => item.batchId === proposal.batchId);
            const id = proposal.batchId;
            return (
              <li key={id}>
                <Card className="border-primary">
                  <CardHeader>
                    <CardTitle className="font-label text-base">
                      {t('proposal.batchTitle', { count: batch.length })}
                    </CardTitle>
                    <CardDescription>{t('proposal.batchHint')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col divide-y">
                      {batch.map((item) => renderBatchItem(item, open))}
                    </ul>
                  </CardContent>
                  <CardFooter className="justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onReview(id, false, true)}
                    >
                      {t('proposal.batchReject')}
                    </Button>
                    {batch.every((item) => item.state === 'pending') && (
                      <Button type="button" onClick={() => onReview(id, true, true)}>
                        {t('proposal.batchApprove')} ({batch.length})
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
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
