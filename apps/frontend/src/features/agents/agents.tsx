import { useRef, useState } from 'react';
import type { Service } from '@homora/shared';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { parseDiff, type Proposal } from './agent-model';
import { BatchItem, ProposalCard } from './proposal-card';
import { ProposalRow } from './proposal-row';
import { ProposalWorkspace } from './proposal-workspace';
import { AgentIdentityWorkspace } from './agent-identity-workspace';
import { AgentsSummary } from './agents-summary';
import { TtlDialog } from './ttl-dialog';
import { useAgentActivity } from '@/hooks/use-agent-activity';
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
  const [editingTtl, setEditingTtl] = useState(false);
  const [view, setView] = useState<'proposals' | 'agents'>('proposals');
  const sectionRef = useRef<HTMLElement>(null);
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
    reviewing,
    create: createAgent,
    rotate: rotateAgent,
    revoke: revokeAgent,
    review: reviewProposal,
    recreate,
    refresh,
    saveTtl,
    pending,
    activeAgents,
    revokedAgents,
    expired,
    history,
  } = workspace;
  /** The reviewed card leaves the list, so keyboard focus would fall back to the page start. */
  const review = async (id: string, approve: boolean, batch = false) => {
    await reviewProposal(id, approve, batch);
    sectionRef.current?.querySelector<HTMLElement>('[role="tabpanel"]')?.focus();
  };
  const events = useAgentActivity(proposals);
  const agentName = (id: string) =>
    agents?.find((agent) => agent.id === id)?.name ?? t('agents.fallbackName');

  const renderBatchItem = (proposal: Proposal, open: boolean) => {
    const diff = parseDiff(proposal.diff);
    return (
      <BatchItem
        key={proposal.id}
        proposal={proposal}
        agentName={agentName(proposal.author)}
        current={services.find((service) => service.id === diff?.id)}
        defaultOpen={open}
      />
    );
  };

  const renderProposal = (proposal: Proposal, open = true) => {
    const diff = parseDiff(proposal.diff);
    return (
      <ProposalCard
        key={proposal.id}
        proposal={proposal}
        now={now}
        onRefresh={
          proposal.state === 'stale' && !proposal.batchId
            ? () => void refresh(proposal.id)
            : undefined
        }
        onRecreate={
          proposal.state === 'expired' &&
          !recreating &&
          (!proposal.batchId ||
            expired.find((p) => p.batchId === proposal.batchId)?.id === proposal.id)
            ? () => void recreate(proposal.id)
            : undefined
        }
        defaultOpen={open}
        agentName={agentName(proposal.author)}
        current={services.find((service) => service.id === diff?.id)}
        busy={reviewing !== null}
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
    <section ref={sectionRef} aria-label={t('agents.title')} className="flex flex-col gap-8">
      <PageHeader
        title={t('agents.title')}
        description={t('agents.description')}
        actions={
          <>
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
      <AgentsSummary
        pending={proposals === null ? null : pending.length}
        active={agents === null ? null : activeAgents.length}
        approved={
          proposals === null ? null : proposals.filter((p) => p.state === 'approved').length
        }
        ttl={ttl}
        onChangeTtl={() => setEditingTtl(true)}
      />
      <TtlDialog
        open={editingTtl}
        onOpenChange={setEditingTtl}
        ttl={ttl}
        onTtlChange={setTtl}
        onSave={saveTtl}
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
            reviewing={reviewing}
            onReview={(id, approve, batch) => void review(id, approve, batch)}
            renderProposal={renderProposal}
            renderBatchItem={renderBatchItem}
            renderRow={renderRow}
          />
        </TabsContent>

        <AgentIdentityWorkspace
          agentsLoaded={agents !== null}
          activeAgents={activeAgents}
          revokedAgents={revokedAgents}
          pending={pending}
          proposals={proposals ?? []}
          events={events}
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
