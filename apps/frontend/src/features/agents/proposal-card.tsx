import type { Service } from '@homora/shared';
import { useState } from 'react';
import { Check, ChevronDown, RefreshCw, X } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Kbd } from '@homora/ui/kbd';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { cn } from '@homora/ui/lib/utils';
import { formatDate, parseDiff, proposalSummary, STATES, type Proposal } from './agent-model';
import { ApproveButton } from './approve-button';
import { diffRisk, needsHold } from './proposal-risk';
import { confirmCopy, DETAIL_FOOTER_CLASS, validity } from './review-model';
import { RiskLabel } from './risk-label';
import { ProposalChange } from './proposal-change';
import { changedFieldLabels } from './proposal-diff';
import { ManagedProposalChange } from './managed-proposal-change';
import { t } from '@/i18n';

const badgeVariant = {
  pending: 'default',
  approved: 'success',
  rejected: 'destructive',
  expired: 'secondary',
  withdrawn: 'secondary',
  stale: 'secondary',
} as const;

type Props = {
  proposal: Proposal;
  agentName: string;
  current?: Service;
  onReview: (approve: boolean) => void;
  onSetupConnection: (draft: unknown) => void;
  hideReview?: boolean;
  /** A decision is in flight (this card's or another's): nothing can be decided until it ends. */
  busy?: boolean;
  now?: number;
  onRecreate?: () => void;
  /** Re-bases a stale proposal on the current configuration, keeping what was asked. */
  onRefresh?: () => void;
};

/** What the proposal changes, in full: the body of a proposal card or of one item of a batch. */
export function ProposalBody({ proposal, current }: { proposal: Proposal; current?: Service }) {
  const diff = parseDiff(proposal.diff);
  return diff?.kind === 'agent' ? (
    <div className="flex flex-col gap-2">
      <p>{t('proposal.agentReview')}</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
        {JSON.stringify(diff, null, 2)}
      </pre>
    </div>
  ) : diff?.kind === 'managed' && diff.change ? (
    <ManagedProposalChange diff={diff} />
  ) : diff ? (
    <ProposalChange diff={diff} current={current} hideTitle />
  ) : (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">{proposal.diff}</pre>
  );
}

/** The fields a proposal touches, as small tags under its title. */
export function ChangedFields({ proposal, current }: { proposal: Proposal; current?: Service }) {
  const diff = parseDiff(proposal.diff);
  const labels = diff ? changedFieldLabels(diff, current) : [];
  if (labels.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <li key={label}>
          <Badge variant="secondary">{label}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** Opens and closes the changes of a proposal. */
export function ChangesToggle({ name, open }: { name: string; open: boolean }) {
  return (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`${open ? t('proposal.hideChanges') : t('proposal.showChanges')}: ${name}`}
      >
        {open ? t('proposal.hideChanges') : t('proposal.showChanges')}
        <ChevronDown
          data-icon="inline-end"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </Button>
    </CollapsibleTrigger>
  );
}

/**
 * An agent proposal in full: its risk, what it changes, who suggested it, how long it is valid,
 * and the decision. The changes are always shown, so nothing is approved without being seen.
 */
export function ProposalCard({
  proposal,
  agentName,
  current,
  onReview,
  onSetupConnection,
  hideReview,
  busy,
  now,
  onRecreate,
  onRefresh,
}: Props) {
  const diff = parseDiff(proposal.diff);
  const pending = proposal.state === 'pending';
  const summary = proposalSummary(diff, current);
  const risk = diffRisk(diff);
  const hold = needsHold(risk);
  return (
    <article aria-label={summary} className="flex min-w-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-2">
          <RiskLabel risk={risk} />
          {!pending && (
            <Badge
              variant={badgeVariant[proposal.state as keyof typeof badgeVariant] ?? 'secondary'}
            >
              {STATES[proposal.state] ? t(STATES[proposal.state]) : proposal.state}
            </Badge>
          )}
        </div>
        <h3 className="font-label text-xl font-semibold">{summary}</h3>
        <p className="text-sm text-muted-foreground">
          {agentName} · {validity(proposal, now, pending)}
          {pending && proposal.refreshedAt
            ? ` · ${t('proposal.refreshed', { date: formatDate(proposal.refreshedAt) })}`
            : ''}
        </p>
        {proposal.batchId && (
          <p className="text-sm text-muted-foreground">
            {t('proposal.batch', { id: proposal.batchId })}
          </p>
        )}
      </header>
      <div className="flex min-w-0 flex-col gap-4 px-4 py-4 lg:px-6">
        <ProposalBody proposal={proposal} current={current} />
      </div>
      {!hideReview && (pending || proposal.state === 'stale') && (
        <footer className={DETAIL_FOOTER_CLASS}>
          {!pending ? (
            <p className="mr-auto text-sm text-muted-foreground max-sm:basis-full">
              {proposal.staleReason
                ? t(`proposal.stale.${proposal.staleReason}`)
                : t('proposal.staleHint')}
            </p>
          ) : (
            hold && (
              <p className="mr-auto text-xs text-muted-foreground max-sm:basis-full">
                {t('proposal.holdHint')}
              </p>
            )
          )}
          <Button
            type="button"
            variant="outline"
            className="max-sm:flex-1"
            disabled={busy}
            onClick={() => onReview(false)}
          >
            <X data-icon="inline-start" />
            {t(proposal.staleReason === 'target-gone' ? 'proposal.retire' : 'proposal.reject')}
            <Kbd aria-hidden="true" className="max-lg:hidden">
              R
            </Kbd>
          </Button>
          {!pending && onRefresh && proposal.staleReason === 'config-changed' && (
            <ApproveButton
              confirm={risk === 'destructive'}
              title={t('proposal.refreshConfirmTitle')}
              actionLabel={t('proposal.refresh')}
              variant="outline"
              description={t('proposal.refreshConfirmBody', { name: summary })}
              disabled={busy}
              onApprove={onRefresh}
            >
              <RefreshCw data-icon="inline-start" />
              {t('proposal.refresh')}
            </ApproveButton>
          )}
          {/* Always present: the buttons keep their places when a proposal turns stale. */}
          <ApproveButton
            confirm={hold}
            {...confirmCopy(risk, summary)}
            variant={risk === 'destructive' ? 'destructive' : 'default'}
            disabled={busy || !pending}
            shortcut="a"
            onApprove={() => onReview(true)}
          >
            <Check data-icon="inline-start" />
            {hold
              ? t('proposal.holdApprove')
              : t(
                  diff?.change?.kind === 'connection-setup'
                    ? 'proposal.managed.approveSetup'
                    : 'proposal.approve',
                )}
          </ApproveButton>
        </footer>
      )}
      {proposal.state === 'expired' && (
        <footer className="flex items-center justify-between gap-2 border-t px-4 py-3 lg:px-6">
          <p>{t('proposal.expiredHint')}</p>
          {onRecreate && (
            <Button type="button" variant="outline" onClick={onRecreate}>
              {t(proposal.batchId ? 'proposal.recreateBatch' : 'proposal.recreate')}
            </Button>
          )}
        </footer>
      )}
      {proposal.state === 'approved' && diff?.change?.kind === 'connection-setup' && (
        <footer className="border-t px-4 py-3 lg:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onSetupConnection(diff.change?.change)}
          >
            {t('proposal.managed.openSetup')}
          </Button>
        </footer>
      )}
    </article>
  );
}

/** One change of a batch: its own summary and changes, decided together with the rest. */
export function BatchItem({
  proposal,
  agentName,
  current,
  defaultOpen = true,
}: {
  proposal: Proposal;
  agentName: string;
  current?: Service;
  defaultOpen?: boolean;
}) {
  const diff = parseDiff(proposal.diff);
  const summary = proposalSummary(diff, current);
  const [open, setOpen] = useState(
    defaultOpen || diff?.kind === 'agent' || diff?.kind === 'managed',
  );
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <RiskLabel risk={diffRisk(diff)} />
            <p className="font-label font-medium">{summary}</p>
            <p className="text-sm text-muted-foreground">{agentName}</p>
            <ChangedFields proposal={proposal} current={current} />
          </div>
          <ChangesToggle name={summary} open={open} />
        </div>
        <CollapsibleContent>
          <ProposalBody proposal={proposal} current={current} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
