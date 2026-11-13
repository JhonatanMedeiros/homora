import { toast } from 'sonner';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { parseDiff, type Agent, type Proposal } from '@/features/agents/agent-model';
import { apiError, t } from '@/i18n';
import { PROPOSALS_CHANGED } from '@/hooks/use-pending-proposals';

async function fetchAgentData(): Promise<[Agent[], Proposal[]]> {
  const [agentResponse, proposalResponse] = await Promise.all([
    fetch('/api/agents'),
    fetch('/api/proposals'),
  ]);
  if (!agentResponse.ok || !proposalResponse.ok) throw new Error();
  return Promise.all([agentResponse.json(), proposalResponse.json()]) as Promise<
    [Agent[], Proposal[]]
  >;
}

/** Agent identity, proposal lifecycle, and API state for the agents management page. */
export function useAgentWorkspace(
  onApplied: () => void | Promise<void>,
  onToken: (name: string, value: string) => void,
) {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [message, setMessage] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
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
      .filter(
        (proposal) =>
          (proposal.state === 'pending' || proposal.state === 'stale') && proposal.expiresAt > now,
      )
      .reduce((min, proposal) => Math.min(min, proposal.expiresAt), Infinity);
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
      const [agentData, proposalData] = await fetchAgentData();
      setAgents(agentData);
      setProposals(proposalData);
      setLoadFailed(false);
      // The menu badge counts the same proposals; tell it they changed.
      window.dispatchEvent(new Event(PROPOSALS_CHANGED));
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchAgentData()
      .then(([agentData, proposalData]) => {
        if (active) {
          setAgents(agentData);
          setProposals(proposalData);
          setLoadFailed(false);
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
    onToken(name, result.token);
    await load();
    return true;
  }

  async function rotate(agent: Agent) {
    const response = await fetch(`/api/agents/${agent.id}/rotate`, { method: 'POST' }).catch(
      () => null,
    );
    if (!response?.ok) {
      setMessage(t('agents.rotateFailed'));
      toast.error(t('agents.rotateFailed'));
      return;
    }
    const result = (await response.json()) as { token: string };
    onToken(agent.name, result.token);
    await load();
  }

  async function revoke(agent: Agent) {
    const response = await fetch(`/api/agents/${agent.id}/revoke`, { method: 'POST' }).catch(
      () => null,
    );
    if (!response?.ok) {
      setMessage(t('agents.revokeFailed'));
      toast.error(t('agents.revokeFailed'));
    } else {
      await load();
      toast.success(t('agents.revokeDone'));
    }
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
      const approved = proposals?.find((proposal) => proposal.id === id);
      const diff = approved ? parseDiff(approved.diff) : null;
      if (result.token) {
        // A newly created identity is not in the loaded list yet: name it from the proposal.
        const proposedName = (diff?.change as { name?: unknown } | undefined)?.name;
        onToken(
          agents?.find((agent) => agent.id === result.agentId)?.name ??
            (typeof proposedName === 'string' ? proposedName : t('agents.fallbackName')),
          result.token,
        );
      }
      const feedback = approve
        ? t(diff?.change?.kind === 'connection-setup' ? 'agents.approvedSetup' : 'agents.approved')
        : t('agents.rejected');
      toast.success(feedback);
      await load();
      await onApplied();
    } else {
      const body = (await response?.json().catch(() => null)) as { code?: string } | null;
      const unexpected = !response || response.status >= 500;
      const feedback = t(
        unexpected
          ? 'agents.reviewError'
          : body?.code === 'batch-conflict'
            ? 'agents.batchConflict'
            : body?.code === 'config-changed'
              ? 'agents.configChanged'
              : body?.code === 'proposal-unavailable'
                ? 'agents.proposalUnavailable'
                : 'agents.reviewFailed',
      );
      setMessage(feedback);
      toast.error(feedback);
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
    const feedback = response?.ok
      ? t('agents.recreated')
      : body?.code === 'config-changed'
        ? t('agents.recreateChanged')
        : apiError(body, t('agents.recreateFailed'));
    if (response?.ok) toast.success(feedback);
    else {
      setMessage(feedback);
      toast.error(feedback);
    }
    await load();
    setRecreating(false);
  }

  async function saveTtl(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/proposal-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlMinutes: Number(ttl) }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(t('agents.ttlFailed'));
      toast.error(t('agents.ttlFailed'));
    } else {
      setMessage('');
      toast.success(t('agents.ttlSaved'));
    }
  }

  const effective = (proposals ?? []).map((proposal) =>
    (proposal.state === 'pending' || proposal.state === 'stale') && proposal.expiresAt <= now
      ? { ...proposal, state: 'expired' }
      : proposal,
  );
  const pending = effective.filter(
    (proposal) => proposal.state === 'pending' || proposal.state === 'stale',
  );
  const activeAgents = (agents ?? []).filter((agent) => !agent.revokedAt);
  const revokedAgents = (agents ?? []).filter((agent) => agent.revokedAt);
  const expired = effective.filter((proposal) => proposal.state === 'expired');
  const history = effective.filter(
    (proposal) =>
      proposal.state !== 'pending' && proposal.state !== 'stale' && proposal.state !== 'expired',
  );

  return {
    agents,
    proposals,
    message,
    setMessage,
    loadFailed,
    now,
    ttl,
    setTtl,
    recreating,
    load,
    create,
    rotate,
    revoke,
    review,
    recreate,
    saveTtl,
    pending,
    activeAgents,
    revokedAgents,
    expired,
    history,
  };
}
