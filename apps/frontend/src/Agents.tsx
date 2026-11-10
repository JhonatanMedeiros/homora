import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Service } from '@homora/shared';
import { Icon } from './icons';

type Agent = { id: string; name: string; scopes: string; revokedAt: number | null };
type Proposal = { id: string; diff: string; expiresAt: number; state: string; author: string };
type ServiceFields = {
  name?: string;
  url?: string;
  category?: string;
  description?: string;
  icon?: string;
};
type Diff = { op?: string; id?: number; service?: ServiceFields };

const SCOPES = [
  { id: 'services:read', label: 'Ler serviços', hint: 'Vê os cards e grupos cadastrados.' },
  {
    id: 'proxmox:read',
    label: 'Ler recursos do Proxmox',
    hint: 'Vê nós, VMs e containers, sem poder alterá-los.',
  },
  {
    id: 'proposals:create',
    label: 'Criar propostas',
    hint: 'Sugere mudanças nos cards. Nada muda sem a sua aprovação.',
  },
];
const scopeLabel = (id: string) => SCOPES.find((scope) => scope.id === id)?.label ?? id;

const STATES: Record<string, string> = {
  pending: 'Aguardando você',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  expired: 'Expirada',
};

function parseScopes(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseDiff(raw: string): Diff | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Diff) : null;
  } catch {
    return null;
  }
}

const FIELDS: [keyof ServiceFields, string][] = [
  ['name', 'Nome'],
  ['url', 'Endereço'],
  ['category', 'Grupo'],
  ['description', 'Descrição'],
  ['icon', 'Ícone'],
];

function ProposalChange({ diff, current }: { diff: Diff; current?: Service }) {
  const name = diff.service?.name ?? current?.name;
  const title =
    diff.op === 'create'
      ? `Adicionar “${name ?? 'novo serviço'}”`
      : diff.op === 'update'
        ? `Alterar “${current?.name ?? name ?? `serviço nº ${diff.id}`}”`
        : diff.op === 'delete'
          ? `Remover “${current?.name ?? `serviço nº ${diff.id}`}”`
          : 'Alteração desconhecida';
  const after = diff.service;
  const rows = FIELDS.map(([key, label]) => {
    const before = current?.[key as keyof Service] as string | undefined;
    const next = after?.[key];
    return { key, label, before: before || '', next: next || '' };
  });
  const changed = rows.filter((row) =>
    diff.op === 'update' ? row.next !== row.before : diff.op === 'create' ? row.next : row.before,
  );
  const unchanged =
    diff.op === 'update' ? rows.filter((row) => row.next === row.before && row.before).length : 0;
  return (
    <div className="proposal-change">
      <p className="proposal-op">{title}</p>
      {diff.op === 'delete' && !current && (
        <p className="hint">Este serviço não está mais no painel.</p>
      )}
      {changed.length > 0 && (
        <dl className="proposal-fields">
          {changed.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              {diff.op === 'update' ? (
                <dd className="proposal-diff">
                  <span className="before">
                    <small>Antes</small>
                    {row.before || '(vazio)'}
                  </span>
                  <span className="after">
                    <small>Depois</small>
                    {row.next || '(vazio)'}
                  </span>
                </dd>
              ) : (
                <dd className={diff.op === 'delete' ? 'removed' : undefined}>
                  {diff.op === 'delete' ? row.before : row.next}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {unchanged > 0 && (
        <p className="hint">
          {unchanged === 1 ? '1 campo continua igual.' : `${unchanged} campos continuam iguais.`}
        </p>
      )}
    </div>
  );
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

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
      setMessage('Não foi possível criar a identidade. Confira o nome e tente de novo.');
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
      setMessage('Não foi possível gerar um novo token.');
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
    if (!response?.ok) setMessage('Não foi possível revogar a identidade.');
    else await load();
  }
  async function review(id: string, approve: boolean) {
    const response = await fetch(`/api/proposals/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    }).catch(() => null);
    if (response?.ok) {
      setMessage(approve ? 'Proposta aprovada e aplicada.' : 'Proposta rejeitada.');
      await load();
      await onApplied();
    } else {
      setMessage('A proposta expirou ou a configuração mudou. Peça ao agente uma nova.');
      await load();
    }
  }
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setMessage('Não foi possível copiar. Selecione o token e copie manualmente.');
    }
  }
  function toggleScope(id: string, checked: boolean) {
    setScopes((current) =>
      checked ? [...new Set([...current, id])] : current.filter((scope) => scope !== id),
    );
  }

  const pending = (proposals ?? []).filter((proposal) => proposal.state === 'pending');
  const history = (proposals ?? []).filter((proposal) => proposal.state !== 'pending');
  const agentName = (id: string) => agents?.find((agent) => agent.id === id)?.name ?? 'Agente';

  function renderProposal(proposal: Proposal) {
    const diff = parseDiff(proposal.diff);
    return (
      <li className={`proposal${proposal.state === 'pending' ? ' pending' : ''}`} key={proposal.id}>
        <div className="proposal-head">
          <div>
            <strong>{agentName(proposal.author)}</strong>
            <small>
              {proposal.state === 'pending'
                ? `Expira em ${formatDate(proposal.expiresAt)}`
                : formatDate(proposal.expiresAt)}
            </small>
          </div>
          <span className={`tag ${proposal.state}`}>
            {STATES[proposal.state] ?? proposal.state}
          </span>
        </div>
        {diff ? (
          <ProposalChange
            diff={diff}
            current={services.find((service) => service.id === diff.id)}
          />
        ) : (
          <pre>{proposal.diff}</pre>
        )}
        {proposal.state === 'pending' && (
          <div className="actions">
            <button type="button" className="btn" onClick={() => void review(proposal.id, false)}>
              Rejeitar
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void review(proposal.id, true)}
            >
              <Icon name="check" />
              Aprovar e aplicar
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="agents">
      <div className="title">
        <div>
          <h1>Agentes</h1>
          <p className="lede">
            Um agente consulta o seu painel e sugere mudanças. Você revisa cada sugestão antes de
            ela valer.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      <div className="notice" role="status">
        {message}
      </div>
      {loadFailed && (
        <div className="notice error" role="alert">
          Não foi possível carregar os agentes. Verifique se o servidor está ativo e use Atualizar.
        </div>
      )}

      <section className="agents-section" aria-labelledby="proposals-title">
        <h2 id="proposals-title">
          Propostas <small>{pending.length ? `${pending.length} para revisar` : ''}</small>
        </h2>
        {proposals === null ? (
          <p className="hint">Carregando...</p>
        ) : pending.length === 0 ? (
          <p className="empty-hint">
            Nenhuma proposta esperando por você. Quando um agente sugerir uma mudança, ela aparece
            aqui.
          </p>
        ) : (
          <ul className="proposal-list">{pending.map(renderProposal)}</ul>
        )}
        {history.length > 0 && (
          <details className="history">
            <summary>Histórico ({history.length})</summary>
            <ul className="proposal-list">{history.map(renderProposal)}</ul>
          </details>
        )}
      </section>

      <section className="agents-section" aria-labelledby="identities-title">
        <h2 id="identities-title">Identidades</h2>
        <p className="hint">
          Cada agente entra com um token próprio e só enxerga o que você permitir abaixo.
        </p>
        {token && (
          <div className="token-box" role="alert">
            <p>
              <strong>Copie o token agora.</strong> Ele não será mostrado de novo.
            </p>
            <div className="token-row">
              <code>{token}</code>
              <button type="button" className="btn small" onClick={() => void copyToken()}>
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <button type="button" className="btn quiet small" onClick={() => setToken('')}>
              Já guardei
            </button>
          </div>
        )}
        <ul className="agent-list">
          {(agents ?? []).map((agent) => (
            <li className="agent-card" key={agent.id}>
              <div className="proposal-head">
                <strong>{agent.name}</strong>
                <span className={`tag ${agent.revokedAt ? 'expired' : 'approved'}`}>
                  {agent.revokedAt ? 'Revogada' : 'Ativa'}
                </span>
              </div>
              <p className="hint">{parseScopes(agent.scopes).map(scopeLabel).join(' · ')}</p>
              {!agent.revokedAt && (
                <div className="actions">
                  <button type="button" className="btn small" onClick={() => void rotate(agent.id)}>
                    Gerar novo token
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void revoke(agent.id)}
                    onBlur={() => setRevoking((current) => (current === agent.id ? null : current))}
                  >
                    {revoking === agent.id ? 'Confirmar revogação' : 'Revogar'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {agents?.length === 0 && <p className="empty-hint">Nenhuma identidade criada ainda.</p>}

        <details
          className="agent-new"
          open={agents !== null && agents.length === 0 ? true : undefined}
        >
          <summary>Nova identidade</summary>
          <form className="agent-form" onSubmit={(event) => void create(event)}>
            <label>
              Nome do agente
              <input
                required
                maxLength={60}
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Assistente da casa"
              />
            </label>
            <fieldset>
              <legend>O que ele pode fazer</legend>
              {SCOPES.map((scope) => (
                <label className="check-field" key={scope.id}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.id)}
                    onChange={(event) => toggleScope(scope.id, event.target.checked)}
                  />
                  {scope.label}
                  <small>{scope.hint}</small>
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={!name.trim()}>
                Criar identidade
              </button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
