import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusLight } from '@/components/status-light';
import { formatAgo, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { permissionCounts, type Agent } from './agent-model';

/** One agent. The whole card opens its details; the name is the control that carries it. */
export function AgentCard({
  agent,
  pending,
  approved,
  lastActivity,
  onOpen,
}: {
  agent: Agent;
  pending: number;
  approved: number;
  /** When the agent last did something that was audited, if ever. */
  lastActivity: number | null;
  onOpen: (agent: Agent) => void;
}) {
  const { read, write } = permissionCounts(agent);
  const revoked = Boolean(agent.revokedAt);
  return (
    <Card
      className={cn(
        'relative w-full min-w-0 gap-3 p-4 transition-colors hover:border-ring',
        revoked && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Button
            type="button"
            variant="link"
            aria-label={t('agents.open', { name: agent.name })}
            onClick={() => onOpen(agent)}
            className="h-auto justify-start p-0 text-base font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:no-underline"
          >
            <span className="truncate">{agent.name}</span>
          </Button>
          <span className="text-sm text-muted-foreground">
            {write > 0 ? t('agents.profileSuggest') : t('agents.profileRead')}
          </span>
        </div>
        {pending > 0 && <Badge>{t('agents.pending', { count: pending })}</Badge>}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <StatusLight
          state={revoked ? 'unknown' : 'available'}
          label={revoked ? t('agents.revoked') : t('agents.active')}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {t('agents.permissionsSummary', { read, write })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {lastActivity === null
          ? t('agents.noActivity')
          : t('agents.lastActivity', { time: formatAgo(lastActivity) })}
        {approved > 0 && ` · ${t('agents.approvedCount', { count: approved })}`}
      </p>
    </Card>
  );
}
