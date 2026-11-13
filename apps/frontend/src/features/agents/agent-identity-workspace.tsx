import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Agent, Proposal } from './agent-model';
import { AgentList } from './agent-list';
import { ConnectDialog } from './connect-dialog';
import { NewAgentDialog } from './new-agent-dialog';
import { TokenDialog } from './token-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { TabsContent } from '@/components/ui/tabs';
import { t } from '@/i18n';

type Props = {
  agentsLoaded: boolean;
  activeAgents: Agent[];
  revokedAgents: Agent[];
  pending: Proposal[];
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
  const [rotating, setRotating] = useState<Agent | null>(null);
  const [revokingAgent, setRevokingAgent] = useState<Agent | null>(null);

  const create = async (name: string, scopes: string[]) => {
    const created = await onCreate(name, scopes);
    if (created) setCreating(false);
    return created;
  };
  const rotate = (agent: Agent) => {
    setRotating(null);
    return onRotate(agent);
  };
  const revoke = (agent: Agent) => {
    setRevokingAgent(null);
    return onRevoke(agent);
  };

  return (
    <>
      <TabsContent value="agents" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('agents.identitiesHint')}</p>
        {!agentsLoaded ? (
          <RowListSkeleton label={t('common.loading')} rows={2} />
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
          <AgentList
            agents={activeAgents}
            pendingCount={(id) => pending.filter((proposal) => proposal.author === id).length}
            onConnect={() => setConnecting(true)}
            onRotate={setRotating}
            onRevoke={setRevokingAgent}
          />
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
              <AgentList
                agents={revokedAgents}
                pendingCount={(id) => pending.filter((proposal) => proposal.author === id).length}
                onConnect={() => setConnecting(true)}
                onRotate={setRotating}
                onRevoke={setRevokingAgent}
              />
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
      <AlertDialog open={rotating !== null} onOpenChange={(open) => !open && setRotating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('agents.rotateTitle', { name: rotating?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('agents.rotateBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotating && void rotate(rotating)}>
              {t('agents.newToken')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={revokingAgent !== null}
        onOpenChange={(open) => !open && setRevokingAgent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('agents.revokeTitle', { name: revokingAgent?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('agents.revokeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => revokingAgent && void revoke(revokingAgent)}
            >
              {t('agents.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
