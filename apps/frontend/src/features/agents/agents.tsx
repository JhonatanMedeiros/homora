import { useState } from 'react';
import type { Service } from '@homora/shared';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { parseDiff, type Proposal } from './agent-model';
import { ProposalCard } from './proposal-card';
import { ProposalRow } from './proposal-row';
import { ProposalWorkspace } from './proposal-workspace';
import { AgentIdentityWorkspace } from './agent-identity-workspace';
import { t } from '@/i18n';
import { useAgentWorkspace } from '@/hooks/use-agent-workspace';

export function Agents({
  services,
  onApplied,
  token,
  setToken,
  onSetupConnection,
}: {
  services: Service[];
  onApplied: () => void | Promise<void>;
  token: string;
  setToken: (token: string) => void;
  onSetupConnection: (draft: unknown) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Name shown in the token dialog; the token itself lives in the parent so it survives navigation.
  const [tokenFor, setTokenFor] = useState('');
  const [view, setView] = useState<'proposals' | 'agents'>('proposals');
  const workspace = useAgentWorkspace(onApplied, (name, value) => {
    setTokenFor(name);
    setToken(value);
  });
  const {
    agents,
    proposals,
    message,
    loadFailed,
    now,
    ttl,
    setTtl,
    recreating,
    load,
    create: createAgent,
    rotate: rotateAgent,
    revoke: revokeAgent,
    review,
    recreate,
    saveTtl,
    pending,
    activeAgents,
    revokedAgents,
    expired,
    history,
  } = workspace;
  const agentName = (id: string) =>
    agents?.find((agent) => agent.id === id)?.name ?? t('agents.fallbackName');

  const renderProposal = (proposal: Proposal, hideReview = false) => {
    const diff = parseDiff(proposal.diff);
    return (
      <ProposalCard
        key={proposal.id}
        proposal={proposal}
        now={now}
        onRecreate={
          proposal.state === 'expired' &&
          !recreating &&
          (!proposal.batchId ||
            expired.find((p) => p.batchId === proposal.batchId)?.id === proposal.id)
            ? () => void recreate(proposal.id)
            : undefined
        }
        hideReview={hideReview}
        agentName={agentName(proposal.author)}
        current={services.find((service) => service.id === diff?.id)}
        onReview={(approve) => void review(proposal.id, approve)}
        onSetupConnection={onSetupConnection}
      />
    );
  };

  const renderRow = (proposal: Proposal) => {
    const diff = parseDiff(proposal.diff);
    return (
      <ProposalRow
        key={proposal.id}
        proposal={proposal}
        agentName={agentName(proposal.author)}
        current={services.find((service) => service.id === diff?.id)}
        onRecreate={
          proposal.state === 'expired' &&
          !recreating &&
          (!proposal.batchId ||
            expired.find((p) => p.batchId === proposal.batchId)?.id === proposal.id)
            ? () => void recreate(proposal.id)
            : undefined
        }
      />
    );
  };

  return (
    <section aria-label={t('agents.title')} className="flex flex-col gap-8">
      <PageHeader
        title={t('agents.title')}
        description={t('agents.description')}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void load()}>
              {t('agents.refresh')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConnecting(true)}>
              {t('agents.connect')}
            </Button>
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus />
              {t('agents.newAgent')}
            </Button>
          </>
        }
      />
      <div role="status" className="empty:hidden">
        {message && (
          <Alert>
            <AlertDescription className="text-foreground">{message}</AlertDescription>
          </Alert>
        )}
      </div>
      {loadFailed && (
        <Alert variant="destructive">
          <AlertDescription>{t('agents.loadFailed')}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={view}
        onValueChange={(value) => setView(value === 'agents' ? 'agents' : 'proposals')}
        className="gap-6"
      >
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="proposals" className="min-h-10">
            {t('agents.proposals')}
            {pending.length > 0 && (
              <span className="font-mono text-xs tabular-nums">{pending.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="agents" className="min-h-10">
            {t('agents.identities')}
            {activeAgents.length > 0 && (
              <span className="font-mono text-xs tabular-nums">{activeAgents.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proposals">
          <ProposalWorkspace
            proposalsLoaded={proposals !== null}
            pending={pending}
            expired={expired}
            history={history}
            ttl={ttl}
            onTtlChange={setTtl}
            onSaveTtl={(event) => void saveTtl(event)}
            onReview={(id, approve, batch) => void review(id, approve, batch)}
            renderProposal={renderProposal}
            renderRow={renderRow}
          />
        </TabsContent>

        <AgentIdentityWorkspace
          agentsLoaded={agents !== null}
          activeAgents={activeAgents}
          revokedAgents={revokedAgents}
          pending={pending}
          token={token}
          tokenFor={tokenFor}
          creating={creating}
          connecting={connecting}
          setToken={setToken}
          setTokenFor={setTokenFor}
          setCreating={setCreating}
          setConnecting={setConnecting}
          onCreate={createAgent}
          onRotate={rotateAgent}
          onRevoke={revokeAgent}
        />
      </Tabs>
    </section>
  );
}
