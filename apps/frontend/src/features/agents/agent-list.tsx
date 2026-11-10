import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { parseScopes, scopeLabel, type Agent } from './agent-model';

type Props = {
  agents: Agent[];
  revoking: string | null;
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
  onRevokeBlur: (id: string) => void;
};

export function AgentList({ agents, revoking, onRotate, onRevoke, onRevokeBlur }: Props) {
  return (
    <ItemGroup className="gap-3">
      {agents.map((agent) => (
        <Item key={agent.id} variant="outline" className="bg-card">
          <ItemContent>
            <ItemTitle className="font-label text-base">
              {agent.name}
              <Badge variant={agent.revokedAt ? 'secondary' : 'success'}>
                {agent.revokedAt ? 'Revogada' : 'Ativa'}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {parseScopes(agent.scopes).map(scopeLabel).join(' · ')}
            </ItemDescription>
          </ItemContent>
          {!agent.revokedAt && (
            <ItemActions>
              <Button type="button" variant="outline" size="sm" onClick={() => onRotate(agent.id)}>
                Gerar novo token
              </Button>
              <Button
                type="button"
                size="sm"
                variant={revoking === agent.id ? 'destructive' : 'ghost'}
                className={
                  revoking === agent.id ? undefined : 'text-destructive hover:text-destructive'
                }
                onClick={() => onRevoke(agent.id)}
                onBlur={() => onRevokeBlur(agent.id)}
              >
                {revoking === agent.id ? 'Confirmar revogação' : 'Revogar'}
              </Button>
            </ItemActions>
          )}
        </Item>
      ))}
    </ItemGroup>
  );
}
