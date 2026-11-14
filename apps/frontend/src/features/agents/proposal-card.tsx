import type { Service } from '@homora/shared';
import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  formatDate,
  isDestructive,
  parseDiff,
  proposalSummary,
  STATES,
  type Proposal,
} from './agent-model';
import { ApproveButton } from './approve-button';
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
  /**
   * Whether the changes are shown at first. Open for a short queue and always for identity and
   * connection proposals, so approving never happens without the values in front of you.
   */
  defaultOpen?: boolean;
};

/** The remaining validity of a pending proposal, or its date once it is decided. */
function validity(proposal: Proposal, now: number | undefined, pending: boolean) {
  if (!pending) return formatDate(proposal.expiresAt);
  if (now === undefined) return t('proposal.expiresAt', { date: formatDate(proposal.expiresAt) });
  const seconds = Math.max(0, Math.ceil((proposal.expiresAt - now) / 1000));
  return seconds < 60
    ? t('proposal.expiresSeconds', { count: seconds })
    : t('proposal.expiresMinutes', { count: Math.ceil(seconds / 60) });
}

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

/** An agent proposal: what it changes, who suggested it, how long it is valid, and the decision. */
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
  defaultOpen = true,
}: Props) {
  const diff = parseDiff(proposal.diff);
  const pending = proposal.state === 'pending';
  const summary = proposalSummary(diff, current);
  // Identity and connection proposals widen what an agent can do: never start them collapsed.
  const [open, setOpen] = useState(
    defaultOpen || diff?.kind === 'agent' || diff?.kind === 'managed',
  );
  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className={cn(pending && 'border-primary')}>
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle className="font-label text-base">{summary}</CardTitle>
            <Badge
              className="row-span-2 self-start"
              variant={badgeVariant[proposal.state as keyof typeof badgeVariant] ?? 'secondary'}
            >
              {STATES[proposal.state] ? t(STATES[proposal.state]) : proposal.state}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {agentName} · {validity(proposal, now, pending)}
            </p>
            {proposal.batchId && (
              <p className="text-sm text-muted-foreground">
                {t('proposal.batch', { id: proposal.batchId })}
              </p>
            )}
            <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
              <ChangedFields proposal={proposal} current={current} />
              <ChangesToggle name={summary} open={open} />
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <ProposalBody proposal={proposal} current={current} />
            </CardContent>
          </CollapsibleContent>
          {!hideReview && (pending || proposal.state === 'stale') && (
            <CardFooter className="justify-end gap-2">
              {!pending && (
                <p className="mr-auto text-sm text-muted-foreground">{t('proposal.staleHint')}</p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onReview(false)}
              >
                <X data-icon="inline-start" />
                {t('proposal.reject')}
              </Button>
              {/* Always present: the buttons keep their places when a proposal turns stale. */}
              <ApproveButton
                confirm={isDestructive(diff)}
                description={t('proposal.confirmBody', { name: summary })}
                disabled={busy || !pending}
                onApprove={() => onReview(true)}
              >
                <Check data-icon="inline-start" />
                {t(
                  diff?.change?.kind === 'connection-setup'
                    ? 'proposal.managed.approveSetup'
                    : 'proposal.approve',
                )}
              </ApproveButton>
            </CardFooter>
          )}
          {proposal.state === 'expired' && (
            <CardFooter className="justify-between gap-2">
              <p>{t('proposal.expiredHint')}</p>
              {onRecreate && (
                <Button type="button" variant="outline" onClick={onRecreate}>
                  {t(proposal.batchId ? 'proposal.recreateBatch' : 'proposal.recreate')}
                </Button>
              )}
            </CardFooter>
          )}
          {proposal.state === 'approved' && diff?.change?.kind === 'connection-setup' && (
            <CardFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onSetupConnection(diff.change?.change)}
              >
                {t('proposal.managed.openSetup')}
              </Button>
            </CardFooter>
          )}
        </Card>
      </Collapsible>
    </li>
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
