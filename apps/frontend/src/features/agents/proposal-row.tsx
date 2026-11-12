import type { Service } from '@homora/shared';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { t } from '@/i18n';
import { formatDate, parseDiff, proposalSummary, STATES, type Proposal } from './agent-model';
import { ManagedProposalChange } from './managed-proposal-change';
import { ProposalChange } from './proposal-change';

type Props = {
  proposal: Proposal;
  agentName: string;
  current?: Service;
  onRecreate?: () => void;
};

/** Compact proposal for finished states (expired, approved, rejected): details open on demand. */
export function ProposalRow({ proposal, agentName, current, onRecreate }: Props) {
  const diff = parseDiff(proposal.diff);
  return (
    <li className="rounded-lg border bg-card">
      <Collapsible>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group min-w-0 flex-1 justify-start gap-2 px-1 text-left"
              aria-label={t('proposal.toggleDetails', { name: proposalSummary(diff, current) })}
            >
              <ChevronDown
                data-icon="inline-start"
                className="transition-transform group-data-[state=open]:rotate-180"
              />
              <span className="truncate font-medium">{proposalSummary(diff, current)}</span>
            </Button>
          </CollapsibleTrigger>
          <span className="text-xs text-muted-foreground">
            {agentName} · {formatDate(proposal.expiresAt)}
          </span>
          <Badge variant={proposal.state === 'approved' ? 'success' : 'secondary'}>
            {STATES[proposal.state] ? t(STATES[proposal.state]) : proposal.state}
          </Badge>
          {onRecreate && (
            <Button type="button" variant="outline" size="sm" onClick={onRecreate}>
              {t(proposal.batchId ? 'proposal.recreateBatch' : 'proposal.recreate')}
            </Button>
          )}
        </div>
        <CollapsibleContent className="border-t px-4 py-3">
          {diff?.kind === 'managed' && diff.change ? (
            <ManagedProposalChange diff={diff} />
          ) : diff && diff.kind !== 'agent' ? (
            <ProposalChange diff={diff} current={current} />
          ) : (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
              {diff ? JSON.stringify(diff, null, 2) : proposal.diff}
            </pre>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
