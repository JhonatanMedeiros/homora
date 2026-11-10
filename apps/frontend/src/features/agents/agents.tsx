import { EmptyNote } from '@/components/empty-note';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Service } from '@homora/shared';
import { ChevronDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { PageHeader } from '@/components/page-header';
import { SectionTitle } from '@/components/section-title';
import { AgentList } from './agent-list';
import { parseDiff, type Agent, type Proposal } from './agent-model';
import { NewAgentForm } from './new-agent-form';
import { ProposalCard } from './proposal-card';
import { TokenNotice } from './token-notice';
import { t } from '@/i18n';

export function Agents({
  services,
  onApplied,
}: {
  services: Service[];
  onApplied: () => void | Promise<void>;
}) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['services:read', 'proposals:create']);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [agentResponse, proposalResponse] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/proposals'),
      ]);
      if (!agentResponse.ok || !proposalResponse.ok) throw new Error();
      setAgents((await agentResponse.json()) as Agent[]);
      setProposals((await proposalResponse.json()) as Proposal[]);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/agents'), fetch('/api/proposals')])
      .then(async ([agentResponse, proposalResponse]) => {
        if (!agentResponse.ok || !proposalResponse.ok) throw new Error();
        const [agentData, proposalData] = (await Promise.all([
          agentResponse.json(),
          proposalResponse.json(),
        ])) as [Agent[], Proposal[]];
        if (active) {
          setAgents(agentData);
          setProposals(proposalData);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(t('agents.createFailed'));
      return;
    }
    const result = (await response.json()) as { token: string };
    setToken(result.token);
    setCopied(false);
    setName('');
    await load();
  }
  async function rotate(id: string) {
    const response = await fetch(`/api/agents/${id}/rotate`, { method: 'POST' }).catch(() => null);
    if (!response?.ok) {
      setMessage(t('agents.rotateFailed'));
      return;
    }
    const result = (await response.json()) as { token: string };
    setToken(result.token);
    setCopied(false);
    await load();
  }
  async function revoke(id: string) {
    if (revoking !== id) {
      setRevoking(id);
      return;
    }
    setRevoking(null);
    const response = await fetch(`/api/agents/${id}/revoke`, { method: 'POST' }).catch(() => null);
    if (!response?.ok) setMessage(t('agents.revokeFailed'));
    else await load();
  }
  async function review(id: string, approve: boolean) {
    const response = await fetch(`/api/proposals/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    }).catch(() => null);
    if (response?.ok) {
      setMessage(approve ? t('agents.approved') : t('agents.rejected'));
      await load();
      await onApplied();
    } else {
      setMessage(t('agents.reviewFailed'));
      await load();
    }
  }
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setMessage(t('agents.copyFailed'));
    }
  }
  function toggleScope(id: string, checked: boolean) {
    setScopes((current) =>
      checked ? [...new Set([...current, id])] : current.filter((scope) => scope !== id),
    );
  }

  const pending = (proposals ?? []).filter((proposal) => proposal.state === 'pending');
  const history = (proposals ?? []).filter((proposal) => proposal.state !== 'pending');
  const agentName = (id: string) =>
    agents?.find((agent) => agent.id === id)?.name ?? t('agents.fallbackName');

  const renderProposal = (proposal: Proposal) => {
    const diff = parseDiff(proposal.diff);
    return (
      <ProposalCard
        key={proposal.id}
        proposal={proposal}
        agentName={agentName(proposal.author)}
        current={services.find((service) => service.id === diff?.id)}
        onReview={(approve) => void review(proposal.id, approve)}
      />
    );
  };

  return (
    <section aria-label={t('agents.title')} className="flex flex-col gap-8">
      <PageHeader
        title={t('agents.title')}
        description={t('agents.description')}
        actions={
          <Button type="button" variant="outline" onClick={() => void load()}>
            {t('agents.refresh')}
          </Button>
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

      <section aria-labelledby="proposals-title" className="flex flex-col gap-3">
        <SectionTitle id="proposals-title" count={pending.length || undefined}>
          {t('agents.proposals')}
        </SectionTitle>
        {proposals === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t('common.loading')}
          </p>
        ) : pending.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyDescription>{t('agents.noProposals')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">{pending.map(renderProposal)}</ul>
        )}
        {history.length > 0 && (
          <Collapsible className="flex flex-col gap-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-fit">
                {t('agents.history', { count: history.length })}
                <ChevronDown data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="flex flex-col gap-3">{history.map(renderProposal)}</ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </section>

      <section aria-labelledby="identities-title" className="flex flex-col gap-3">
        <SectionTitle id="identities-title">{t('agents.identities')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('agents.identitiesHint')}</p>
        {token && (
          <TokenNotice
            token={token}
            copied={copied}
            onCopy={() => void copyToken()}
            onDismiss={() => setToken('')}
          />
        )}
        <AgentList
          agents={agents ?? []}
          revoking={revoking}
          onRotate={(id) => void rotate(id)}
          onRevoke={(id) => void revoke(id)}
          onRevokeBlur={(id) => setRevoking((current) => (current === id ? null : current))}
        />
        {agents?.length === 0 && <EmptyNote>{t('agents.noIdentities')}</EmptyNote>}
        <NewAgentForm
          defaultOpen={agents !== null && agents.length === 0}
          name={name}
          scopes={scopes}
          onNameChange={setName}
          onScopeChange={toggleScope}
          onSubmit={(event: FormEvent) => void create(event)}
        />
      </section>
    </section>
  );
}
