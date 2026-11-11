import { MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { formatDate, isWriteScope, parseScopes, scopeLabel, type Agent } from './agent-model';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

type Props = {
  agents: Agent[];
  pendingCount: (agentId: string) => number;
  onConnect: () => void;
  onRotate: (agent: Agent) => void;
  onRevoke: (agent: Agent) => void;
};

export function AgentList({ agents, pendingCount, onConnect, onRotate, onRevoke }: Props) {
  return (
    <ItemGroup className="gap-3">
      {agents.map((agent) => {
        const pending = pendingCount(agent.id);
        return (
          <Item
            key={agent.id}
            variant="outline"
            className={cn('bg-card', agent.revokedAt && 'opacity-70')}
          >
            <ItemContent className="gap-2">
              <ItemTitle className="font-label text-base">
                {agent.name}
                <Badge variant={agent.revokedAt ? 'secondary' : 'success'}>
                  {agent.revokedAt ? t('agents.revoked') : t('agents.active')}
                </Badge>
                {pending > 0 && <Badge>{t('agents.pending', { count: pending })}</Badge>}
              </ItemTitle>
              {agent.createdAt !== undefined && (
                <span className="font-mono text-xs text-muted-foreground">
                  {t('agents.createdAt', { date: formatDate(agent.createdAt) })}
                </span>
              )}
              <ul className="flex flex-wrap gap-1.5" aria-label={t('agents.canDo')}>
                {parseScopes(agent.scopes).map((scope) => (
                  <li key={scope}>
                    <Badge variant={isWriteScope(scope) ? 'default' : 'secondary'}>
                      {scopeLabel(scope)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </ItemContent>
            {!agent.revokedAt && (
              <ItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('agents.options', { name: agent.name })}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={onConnect}>
                      {t('agents.howToConnect')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onRotate(agent)}>
                      {t('agents.newToken')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onRevoke(agent)}>
                      {t('agents.revoke')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ItemActions>
            )}
          </Item>
        );
      })}
    </ItemGroup>
  );
}
