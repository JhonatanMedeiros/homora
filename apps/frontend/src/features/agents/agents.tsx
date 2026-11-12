import { useCallback, useEffect, useState } from 'react';
import type { Service } from '@homora/shared';
import { ChevronDown, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { AgentList } from './agent-list';
import { parseDiff, type Agent, type Proposal } from './agent-model';
import { ConnectDialog } from './connect-dialog';
import { NewAgentDialog } from './new-agent-dialog';
import { ProposalCard } from './proposal-card';
import { ProposalRow } from './proposal-row';
import { TokenDialog } from './token-dialog';
import { apiError, t } from '@/i18n';

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
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [rotating, setRotating] = useState<Agent | null>(null);
  const [revokingAgent, setRevokingAgent] = useState<Agent | null>(null);
  // Name shown in the token dialog; the token itself lives in the parent so it survives navigation.
  const [tokenFor, setTokenFor] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<'proposals' | 'agents'>('proposals');
  const [now, setNow] = useState(() => Date.now());
  const [ttl, setTtl] = useState('15');
  const [recreating, setRecreating] = useState(false);
  useEffect(() => {
    fetch('/api/proposal-settings')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { ttlMinutes: number }) => setTtl(String(data.ttlMinutes)))
      .catch(() => setMessage(t('agents.ttlFailed')));
  }, []);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 30_000);
    const next = (proposals ?? [])
      .filter((p) => (p.state === 'pending' || p.state === 'stale') && p.expiresAt > now)
      .reduce((min, p) => Math.min(min, p.expiresAt), Infinity);
    const timeout = Number.isFinite(next)
      ? window.setTimeout(tick, Math.max(0, next - Date.now()))
      : undefined;
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [proposals, now]);

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

  async function create(name: string, scopes: string[]): Promise<boolean> {
    setMessage('');
    const response = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scopes }),
    }).catch(() => null);
    if (!response?.ok) return false;
    const result = (await response.json()) as { token: string };
    setTokenFor(name);
    setToken(result.token);
    setCreating(false);
    await load();
    return true;
  }
  async function rotate(agent: Agent) {
    setRotating(null);
    const response = await fetch(`/api/agents/${agent.id}/rotate`, { method: 'POST' }).catch(
      () => null,
    );
    if (!response?.ok) {
      setMessage(t('agents.rotateFailed'));
      return;
    }
    const result = (await response.json()) as { token: string };
    setTokenFor(agent.name);
    setToken(result.token);
    await load();
  }
  async function revoke(agent: Agent) {
    setRevokingAgent(null);
    const response = await fetch(`/api/agents/${agent.id}/revoke`, { method: 'POST' }).catch(
      () => null,
    );
    if (!response?.ok) setMessage(t('agents.revokeFailed'));
    else await load();
  }
  async function review(id: string, approve: boolean, batch = false) {
    const response = await fetch(
      batch ? `/api/proposal-batches/${id}/review` : `/api/proposals/${id}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve }),
      },
    ).catch(() => null);
    if (response?.ok) {
      const result = (await response.json()) as { token?: string; agentId?: string };
      if (result.token) {
        setTokenFor(
          agents?.find((agent) => agent.id === result.agentId)?.name ?? t('agents.fallbackName'),
        );
        setToken(result.token);
      }
      const approved = proposals?.find((proposal) => proposal.id === id);
      const diff = approved ? parseDiff(approved.diff) : null;
      setMessage(
        approve
          ? t(
              diff?.change?.kind === 'connection-setup'
                ? 'agents.approvedSetup'
                : 'agents.approved',
            )
          : t('agents.rejected'),
      );
      await load();
      await onApplied();
    } else {
      const body = (await response?.json().catch(() => null)) as { code?: string } | null;
      setMessage(
        t(
          body?.code === 'batch-conflict'
            ? 'agents.batchConflict'
            : body?.code === 'config-changed'
              ? 'agents.configChanged'
              : body?.code === 'proposal-unavailable'
                ? 'agents.proposalUnavailable'
                : 'agents.reviewFailed',
        ),
      );
      await load();
    }
  }
  async function recreate(id: string) {
    setRecreating(true);
    const response = await fetch(`/api/proposals/${id}/recreate`, { method: 'POST' }).catch(
      () => null,
    );
    const body = !response?.ok
      ? ((await response?.json().catch(() => null)) as { code?: string } | null)
      : null;
    setMessage(
      response?.ok
        ? t('agents.recreated')
        : body?.code === 'config-changed'
          ? t('agents.recreateChanged')
          : apiError(body, t('agents.recreateFailed')),
    );
    await load();
    setRecreating(false);
  }
  async function saveTtl(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/proposal-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlMinutes: Number(ttl) }),
    }).catch(() => null);
    if (!response?.ok) setMessage(t('agents.ttlFailed'));
    else setMessage('');
  }
  const effective = (proposals ?? []).map((proposal) =>
    (proposal.state === 'pending' || proposal.state === 'stale') && proposal.expiresAt <= now
      ? { ...proposal, state: 'expired' }
      : proposal,
  );
  const pending = effective.filter(
    (proposal) => proposal.state === 'pending' || proposal.state === 'stale',
  );
  const expired = effective.filter((proposal) => proposal.state === 'expired');
  const history = effective.filter(
    (proposal) =>
      proposal.state !== 'pending' && proposal.state !== 'stale' && proposal.state !== 'expired',
  );
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
            {agents && agents.length > 0 && (
              <span className="font-mono text-xs tabular-nums">{agents.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proposals" className="flex flex-col gap-3">
          <form
            onSubmit={(event) => void saveTtl(event)}
            className="flex flex-wrap items-end gap-2"
          >
            <Field className="w-auto">
              <FieldLabel htmlFor="proposal-ttl">{t('agents.ttl')}</FieldLabel>
              <Input
                id="proposal-ttl"
                type="number"
                min={1}
                max={120}
                required
                value={ttl}
                onChange={(event) => setTtl(event.target.value)}
              />
            </Field>
            <Button type="submit" variant="outline">
              {t('agents.ttlSave')}
            </Button>
          </form>
          {proposals === null ? (
            <RowListSkeleton label={t('common.loading')} rows={2} />
          ) : pending.length === 0 ? (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyDescription>{t('agents.noProposals')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((proposal, index) => {
                if (!proposal.batchId) return renderProposal(proposal);
                if (pending.findIndex((p) => p.batchId === proposal.batchId) !== index) return null;
                const batch = pending.filter((p) => p.batchId === proposal.batchId);
                const id = proposal.batchId;
                return (
                  <li key={id} className="flex flex-col gap-3">
                    <ul className="flex flex-col gap-3">
                      {batch.map((item) => renderProposal(item, true))}
                    </ul>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void review(id, false, true)}
                      >
                        {t('proposal.batchReject')}
                      </Button>
                      {batch.every((p) => p.state === 'pending') && (
                        <Button type="button" onClick={() => void review(id, true, true)}>
                          {t('proposal.batchApprove')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {expired.length > 0 && (
            <Collapsible className="flex flex-col gap-3">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="group w-fit">
                  {t('agents.expired', { count: expired.length })}
                  <ChevronDown
                    data-icon="inline-end"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{t('agents.expiredHint')}</p>
                <ul className="flex flex-col gap-2">
                  {expired.map((proposal) => renderRow(proposal))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
          {history.length > 0 && (
            <Collapsible className="flex flex-col gap-3">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="group w-fit">
                  {t('agents.history', { count: history.length })}
                  <ChevronDown
                    data-icon="inline-end"
                    className="transition-transform group-data-[state=open]:rotate-180"
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="flex flex-col gap-2">
                  {history.map((proposal) => renderRow(proposal))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </TabsContent>

        <TabsContent value="agents" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t('agents.identitiesHint')}</p>
          {agents?.length === 0 ? (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>{t('agents.noIdentities')}</EmptyTitle>
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
              agents={agents ?? []}
              pendingCount={(id) => pending.filter((proposal) => proposal.author === id).length}
              onConnect={() => setConnecting(true)}
              onRotate={setRotating}
              onRevoke={setRevokingAgent}
            />
          )}
        </TabsContent>
      </Tabs>

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
    </section>
  );
}
