import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { Agent, Proposal } from './agent-model';
import { AgentCard } from './agent-card';
import { AgentDialog } from './agent-dialog';
import { agentEvents } from './agent-activity';
import type { ActivityEvent } from '@/features/activity/activity-model';
import { ConnectDialog } from './connect-dialog';
import { NewAgentDialog } from './new-agent-dialog';
import { TokenDialog } from './token-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { CardGridSkeleton } from '@/components/skeletons';
import { TabsContent } from '@/components/ui/tabs';
import { t } from '@/i18n';

type Props = {
  agentsLoaded: boolean;
  activeAgents: Agent[];
  revokedAgents: Agent[];
  pending: Proposal[];
  proposals: Proposal[];
  /** Audited proposal events, or `null` while they load. */
  events: ActivityEvent[] | null;
  token: string;
  tokenFor: string;
  creating: boolean;
  connecting: boolean;
  setToken: (token: string) => void;
  setTokenFor: (name: string) => void;
  setCreating: (open: boolean) => void;
  setConnecting: (open: boolean) => void;
  onCreate: (name: string, scopes: string[]) => Promise<boolean>;
  onRotate: (agent: Agent) => Promise<void>;
  onRevoke: (agent: Agent) => Promise<void>;
};

/** Identity management: list states, creation, token handling, rotation, and revocation. */
export function AgentIdentityWorkspace({
  agentsLoaded,
  activeAgents,
  revokedAgents,
  pending,
  proposals,
  events,
  token,
  tokenFor,
  creating,
  connecting,
  setToken,
  setTokenFor,
  setCreating,
  setConnecting,
  onCreate,
  onRotate,
  onRevoke,
}: Props) {
  const [opened, setOpened] = useState<Agent | null>(null);

  const create = async (name: string, scopes: string[]) => {
    const created = await onCreate(name, scopes);
    if (created) setCreating(false);
    return created;
  };
  const cardFor = (agent: Agent) => {
    const mine = agentEvents(agent, events ?? [], proposals);
    return (
      <li key={agent.id} className="flex">
        <AgentCard
          agent={agent}
          pending={pending.filter((proposal) => proposal.author === agent.id).length}
          approved={
            proposals.filter(
              (proposal) => proposal.author === agent.id && proposal.state === 'approved',
            ).length
          }
          lastActivity={mine[0]?.createdAt ?? null}
          onOpen={setOpened}
        />
      </li>
    );
  };

  return (
    <>
      <TabsContent value="agents" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('agents.identitiesHint')}</p>
        {!agentsLoaded ? (
          <CardGridSkeleton label={t('common.loading')} />
        ) : activeAgents.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyTitle>
                {t(revokedAgents.length ? 'agents.noActive' : 'agents.noIdentities')}
              </EmptyTitle>
              <EmptyDescription>{t('agents.noIdentitiesHint')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={() => setCreating(true)}>
                {t('agents.createFirst')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeAgents.map(cardFor)}
            <li className="flex">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-4 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Plus className="size-4" />
                  {t('agents.newAgent')}
                </span>
                <span className="text-sm">{t('agents.addCardHint')}</span>
              </button>
            </li>
          </ul>
        )}
        {revokedAgents.length > 0 && (
          <Collapsible className="flex flex-col gap-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="group w-fit">
                {t('agents.revokedList', { count: revokedAgents.length })}
                <ChevronDown
                  data-icon="inline-end"
                  className="transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {revokedAgents.map(cardFor)}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </TabsContent>
      <NewAgentDialog open={creating} onOpenChange={setCreating} onCreate={create} />
      <ConnectDialog open={connecting} onOpenChange={setConnecting} />
      {token && (
        <TokenDialog
          token={token}
          agentName={tokenFor || t('agents.fallbackName')}
          onDone={() => {
            setToken('');
            setTokenFor('');
          }}
        />
      )}
      <AgentDialog
        agent={opened}
        events={opened ? agentEvents(opened, events ?? [], proposals) : []}
        onClose={() => setOpened(null)}
        onConnect={() => {
          setOpened(null);
          setConnecting(true);
        }}
        onRotate={onRotate}
        onRevoke={onRevoke}
      />
    </>
  );
}
