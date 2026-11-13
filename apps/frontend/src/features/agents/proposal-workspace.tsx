import type { FormEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';
import type { Proposal } from './agent-model';

export function ProposalWorkspace({
  proposalsLoaded,
  pending,
  expired,
  history,
  ttl,
  onTtlChange,
  onSaveTtl,
  onReview,
  renderProposal,
  renderRow,
}: {
  proposalsLoaded: boolean;
  pending: Proposal[];
  expired: Proposal[];
  history: Proposal[];
  ttl: string;
  onTtlChange: (value: string) => void;
  onSaveTtl: (event: FormEvent<HTMLFormElement>) => void;
  onReview: (id: string, approve: boolean, batch?: boolean) => void;
  renderProposal: (proposal: Proposal, hideReview?: boolean) => ReactNode;
  renderRow: (proposal: Proposal) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={onSaveTtl} className="flex flex-wrap items-end gap-2">
        <Field className="w-auto">
          <FieldLabel htmlFor="proposal-ttl">{t('agents.ttl')}</FieldLabel>
          <Input
            id="proposal-ttl"
            type="number"
            min={1}
            max={120}
            required
            value={ttl}
            onChange={(event) => onTtlChange(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline">
          {t('agents.ttlSave')}
        </Button>
      </form>
      {!proposalsLoaded ? (
        <RowListSkeleton label={t('common.loading')} rows={2} />
      ) : pending.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyDescription>{t('agents.noProposals')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((proposal, index) => {
            if (!proposal.batchId) return renderProposal(proposal);
            if (pending.findIndex((item) => item.batchId === proposal.batchId) !== index)
              return null;
            const batch = pending.filter((item) => item.batchId === proposal.batchId);
            const id = proposal.batchId;
            return (
              <li key={id} className="flex flex-col gap-3">
                <ul className="flex flex-col gap-3">
                  {batch.map((item) => renderProposal(item, true))}
                </ul>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => onReview(id, false, true)}>
                    {t('proposal.batchReject')}
                  </Button>
                  {batch.every((item) => item.state === 'pending') && (
                    <Button type="button" onClick={() => onReview(id, true, true)}>
                      {t('proposal.batchApprove')}
                    </Button>
                  )}
                </div>
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
