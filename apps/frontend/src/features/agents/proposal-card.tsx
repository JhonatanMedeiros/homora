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
import { t } from '@/i18n';

const badgeVariant = {
  pending: 'default',
  approved: 'success',
  rejected: 'destructive',
  expired: 'secondary',
} as const;

type Props = {
  proposal: Proposal;
  agentName: string;
  current?: Service;
  onReview: (approve: boolean) => void;
};

/** An agent proposal: author, validity, reviewable diff, and explicit decision. */
export function ProposalCard({ proposal, agentName, current, onReview }: Props) {
  const diff = parseDiff(proposal.diff);
  const pending = proposal.state === 'pending';
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
              ? t('proposal.expiresAt', { date: formatDate(proposal.expiresAt) })
              : formatDate(proposal.expiresAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diff ? (
            <ProposalChange diff={diff} current={current} />
          ) : (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
              {proposal.diff}
            </pre>
          )}
        </CardContent>
        {pending && (
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onReview(false)}>
              <X data-icon="inline-start" />
              {t('proposal.reject')}
            </Button>
            <Button type="button" onClick={() => onReview(true)}>
              <Check data-icon="inline-start" />
              {t('proposal.approve')}
            </Button>
          </CardFooter>
        )}
      </Card>
    </li>
  );
}
