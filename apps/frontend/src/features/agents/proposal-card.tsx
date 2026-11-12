import type { Service } from '@homora/shared';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDate, parseDiff, STATES, type Proposal } from './agent-model';
import { ProposalChange } from './proposal-change';
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
  now?: number;
  onRecreate?: () => void;
};

/** An agent proposal: author, validity, reviewable diff, and explicit decision. */
export function ProposalCard({
  proposal,
  agentName,
  current,
  onReview,
  onSetupConnection,
  hideReview,
  now,
  onRecreate,
}: Props) {
  const diff = parseDiff(proposal.diff);
  const pending = proposal.state === 'pending';
  const seconds = now === undefined ? 0 : Math.max(0, Math.ceil((proposal.expiresAt - now) / 1000));
  return (
    <li>
      <Card className={cn(pending && 'border-primary')}>
        <CardHeader className="grid-cols-[1fr_auto]">
          <CardTitle className="font-label text-base">{agentName}</CardTitle>
          <Badge
            className="row-span-2 self-start"
            variant={badgeVariant[proposal.state as keyof typeof badgeVariant] ?? 'secondary'}
          >
            {STATES[proposal.state] ? t(STATES[proposal.state]) : proposal.state}
          </Badge>
          <CardDescription>
            {pending
              ? now === undefined
                ? t('proposal.expiresAt', { date: formatDate(proposal.expiresAt) })
                : seconds < 60
                  ? t('proposal.expiresSeconds', { count: seconds })
                  : t('proposal.expiresMinutes', { count: Math.ceil(seconds / 60) })
              : formatDate(proposal.expiresAt)}
          </CardDescription>
          {proposal.batchId && (
            <CardDescription>{t('proposal.batch', { id: proposal.batchId })}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {diff?.kind === 'agent' ? (
            <div className="flex flex-col gap-2">
              <p className="font-semibold">{t('proposal.agentChange')}</p>
              <p>{t('proposal.agentReview')}</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
                {JSON.stringify(diff, null, 2)}
              </pre>
            </div>
          ) : diff?.kind === 'managed' && diff.change ? (
            <ManagedProposalChange diff={diff} />
          ) : diff ? (
            <ProposalChange diff={diff} current={current} />
          ) : (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
              {proposal.diff}
            </pre>
          )}
        </CardContent>
        {!hideReview && (pending || proposal.state === 'stale') && (
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onReview(false)}>
              <X data-icon="inline-start" />
              {t('proposal.reject')}
            </Button>
            {pending && (
              <Button type="button" onClick={() => onReview(true)}>
                <Check data-icon="inline-start" />
                {t(
                  diff?.change?.kind === 'connection-setup'
                    ? 'proposal.managed.approveSetup'
                    : 'proposal.approve',
                )}
              </Button>
            )}
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
    </li>
  );
}
