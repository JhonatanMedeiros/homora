import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Icon } from './icons';
import { IntegrationCatalog } from './IntegrationCatalog';
import { Proxmox } from './Proxmox';
import { Connections } from './Connections';

const empty: ServiceInput = {
  name: '',
  url: '',
  category: '',
  description: '',
  allowPrivate: false,
};
type ServiceGroup = { id: number; name: string; position: number };
type Tab = 'services' | 'integrations' | 'proposals';
type ServiceStatus = {
  status: 'available' | 'unavailable' | 'unknown';
  lastAttempt: string | null;
};

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const current =
    root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('homora-theme', next);
  } catch {
    // Sem armazenamento disponível: a escolha vale só nesta página.
  }
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceStatuses, setServiceStatuses] = useState<Record<number, ServiceStatus>>({});
  const [groupRows, setGroupRows] = useState<ServiceGroup[]>([]);
  const [groupDraft, setGroupDraft] = useState('');
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [groupError, setGroupError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ServiceInput>(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('services');
  const [menu, setMenu] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [proposals, setProposals] = useState<
    { id: string; diff: string; expiresAt: number; state: string; author: string }[]
  >([]);
  const [agentName, setAgentName] = useState('');
  const [agentScopes, setAgentScopes] = useState<string[]>(['services:read', 'proposals:create']);
  const [newAgentToken, setNewAgentToken] = useState('');
  const [agents, setAgents] = useState<
    { id: string; name: string; scopes: string; revokedAt: number | null }[]
  >([]);
  async function loadAgents() {
    const r = await fetch('/api/agents');
    if (r.ok) setAgents(await r.json());
  }
  async function loadProposals() {
    const r = await fetch('/api/proposals');
    if (r.ok) setProposals(await r.json());
  }
  async function reviewProposal(id: string, approve: boolean) {
    const r = await fetch(`/api/proposals/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    });
    if (r.ok) {
      await loadProposals();
      await refresh();
    } else setMessage('A proposta expirou ou a configuração mudou.');
  }
  async function createAgent() {
    const r = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: agentName, scopes: agentScopes }),
    });
    if (r.ok) {
      const result = await r.json();
      setNewAgentToken(result.token);
      setAgentName('');
      await loadAgents();
    }
  }
  async function rotateAgent(id: string) {
    const r = await fetch(`/api/agents/${id}/rotate`, { method: 'POST' });
    if (r.ok) {
      const result = await r.json();
      setNewAgentToken(result.token);
      await loadAgents();
    }
  }
  async function revokeAgent(id: string) {
    const r = await fetch(`/api/agents/${id}/revoke`, { method: 'POST' });
    if (r.ok) await loadAgents();
  }
  const formRef = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  async function refresh() {
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw Error();
      setServices((await response.json()) as Service[]);
      const groupResponse = await fetch('/api/groups');
      if (groupResponse.ok) setGroupRows((await groupResponse.json()) as ServiceGroup[]);
      setMessage('');
    } catch {
      setMessage('Não foi possível carregar os serviços. Verifique se o servidor está ativo.');
    }
  }
  useEffect(() => {
    let active = true;
    fetch('/api/services')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Service[]>;
      })
      .then((data) => {
        if (active) {
          setServices(data);
          setMessage('');
        }
      })
      .catch(() => {
        if (active)
          setMessage('Não foi possível carregar os serviços. Verifique se o servidor está ativo.');
      });
    fetch('/api/groups')
      .then((response) => (response.ok ? (response.json() as Promise<ServiceGroup[]>) : []))
      .then((data) => {
        if (active) setGroupRows(data);
      })
      .catch(() => {});
    const key = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      active = false;
      document.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshStatuses = () =>
      fetch('/api/service-status')
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<Record<number, ServiceStatus>>;
        })
        .then((data) => {
          if (active) setServiceStatuses(data);
        })
        .catch(() => {
          // Monitoramento é auxiliar; uma falha não interfere nos serviços.
        });
    void refreshStatuses();
    const timer = window.setInterval(() => void refreshStatuses(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (formOpen) {
      formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      nameInput.current?.focus({ preventScroll: true });
    }
  }, [formOpen]);
  const categories = useMemo(
    () => [
      ...new Set([...groupRows.map((group) => group.name), ...services.map((s) => s.category)]),
    ],
    [services, groupRows],
  );
  const filtered = services.filter(
    (s) =>
      (selected === null || s.category === selected) &&
      `${s.name} ${s.category} ${s.description} ${s.url}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR').trim()),
  );
  const groups = [...categories]
    .sort((a, b) => {
      const ai = groupRows.find((group) => group.name === a)?.position ?? 9999,
        bi = groupRows.find((group) => group.name === b)?.position ?? 9999;
      return ai - bi || a.localeCompare(b, 'pt-BR');
    })
    .map((category) => ({
      category,
      items: filtered
        .filter((s) => s.category === category)
        .sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
        ),
    }))
    .filter((group) => group.items.length || !query.trim());
  function openForm(service?: Service) {
    setTab('services');
    setMenu(null);
    setConfirming(null);
    setEditing(service?.id ?? null);
    setForm(
      service
        ? {
            name: service.name,
            url: service.url,
            category: service.category,
            description: service.description,
            icon: service.icon ?? '',
            position: service.position ?? 0,
            allowPrivate: service.allowPrivate === true,
          }
        : empty,
    );
    setError('');
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    if (editing !== null)
      document.querySelector<HTMLButtonElement>(`[data-service-edit="${editing}"]`)?.focus();
    else addButton.current?.focus();
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (formOpen) {
        setFormOpen(false);
        if (editing !== null)
          document.querySelector<HTMLButtonElement>(`[data-service-edit="${editing}"]`)?.focus();
        else addButton.current?.focus();
      }
      if (editingGroup !== null) {
        setEditingGroup(null);
        setGroupDraft('');
        document.querySelector<HTMLButtonElement>(`[data-group-edit="${editingGroup}"]`)?.focus();
      }
      setConfirming(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [formOpen, editingGroup, editing]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        editing === null ? '/api/services' : `/api/services/${editing}`,
        {
          method: editing === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error);
      closeForm();
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }
  async function remove(s: Service) {
    if (confirming !== s.id) {
      setConfirming(s.id);
      return;
    }
    setConfirming(null);
    try {
      const response = await fetch(`/api/services/${s.id}`, { method: 'DELETE' });
      if (!response.ok) throw Error();
      setSelected(null);
      setMenu(null);
      await refresh();
    } catch {
      setMessage('Não foi possível remover o serviço.');
    }
  }
  function openFirst() {
    const first = groups.flatMap((group) => group.items)[0];
    if (first) window.open(first.url, '_blank', 'noopener,noreferrer');
  }
  async function moveGroup(category: string, direction: -1 | 1) {
    const ordered = [...categories].sort(
      (a, b) =>
        (groupRows.find((g) => g.name === a)?.position ?? 9999) -
          (groupRows.find((g) => g.name === b)?.position ?? 9999) || a.localeCompare(b, 'pt-BR'),
    );
    const from = ordered.indexOf(category),
      to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    setGroupRows(
      ordered.map((name, position) => ({
        id: groupRows.find((group) => group.name === name)?.id ?? -1,
        name,
        position,
      })),
    );
    try {
      const response = await fetch('/api/groups/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: ordered }),
      });
      if (!response.ok) throw Error();
    } catch {
      setMessage('Não foi possível salvar a ordem dos grupos.');
      void refresh();
    }
  }
  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    setGroupError('');
    try {
      const response = await fetch(
        editingGroup === null ? '/api/groups' : `/api/groups/${editingGroup}`,
        {
          method: editingGroup === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupDraft }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error || 'Não foi possível salvar o grupo.');
      const wasEditing = editingGroup !== null;
      setEditingGroup(null);
      setGroupDraft('');
      setSelected(null);
      await refresh();
      if (wasEditing) document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível salvar o grupo.');
    }
  }
  async function deleteGroup(group: ServiceGroup) {
    try {
      const response = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error || 'Não foi possível remover o grupo.');
      await refresh();
      document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível remover o grupo.');
    }
  }
  async function moveService(service: Service, direction: -1 | 1) {
    const ordered = services
      .filter((item) => item.category === service.category)
      .sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
      );
    const from = ordered.findIndex((item) => item.id === service.id),
      to = from + direction;
    if (to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    setServices((items) =>
      items.map((item) => {
        const index = ordered.findIndex((entry) => entry.id === item.id);
        return index < 0 ? item : { ...item, position: index };
      }),
    );
    try {
      const response = await fetch('/api/services/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: service.category, ids: ordered.map((item) => item.id) }),
      });
      if (!response.ok) throw Error();
    } catch {
      setMessage('Não foi possível salvar a ordem dos cards.');
      void refresh();
    }
  }
  return (
    <div className="shell" data-tab={tab}>
      <header className="top">
        <div className="wrap">
          <a className="wordmark" href="/" aria-label="Homora, início">
            <Icon name="mark" />
            <span>Homora</span>
          </a>
          <button type="button" className="ibtn" onClick={toggleTheme} aria-label="Alternar tema">
            <Icon name="contrast" />
          </button>
          <button type="button" className="ibtn" onClick={onLogout} aria-label="Sair">
            <Icon name="logout" />
          </button>
          <label className="search">
            <Icon name="search" />
            <span className="sr">Buscar serviço</span>
            <input
              ref={search}
              type="search"
              placeholder="Buscar serviço"
              autoComplete="off"
              enterKeyHint="go"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab('services');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openFirst();
                if (e.key === 'Escape') setQuery('');
              }}
            />
            <kbd>Ctrl K</kbd>
          </label>
        </div>
      </header>
      <main className="wrap layout">
        <section className="panel p-services" aria-label="Serviços">
          <div className="title">
            <div>
              <h1>Seus serviços</h1>
              <p className="lede">
                {services.length
                  ? `${services.length} ${services.length === 1 ? 'serviço' : 'serviços'} em ${categories.length} ${categories.length === 1 ? 'grupo' : 'grupos'}.`
                  : 'Nenhum serviço cadastrado ainda.'}
              </p>
            </div>
            <button
              ref={addButton}
              type="button"
              className="btn primary"
              onClick={() => openForm()}
            >
              <Icon name="plus" />
              Adicionar serviço
            </button>
          </div>
          {editingGroup === null && (
            <form className="group-create" onSubmit={(event) => void saveGroup(event)}>
              <label htmlFor="new-group">Novo grupo</label>
              <input
                id="new-group"
                data-group-input
                value={groupDraft}
                onChange={(event) => setGroupDraft(event.target.value)}
                maxLength={40}
                placeholder="Ex.: Casa"
              />
              <button
                data-group-add
                type="submit"
                className="btn small"
                disabled={!groupDraft.trim()}
              >
                Criar grupo
              </button>
            </form>
          )}
          <p className="form-error" role="alert">
            {groupError}
          </p>
          {editingGroup !== null && (
            <form
              className="group-create"
              aria-label="Renomear grupo"
              onSubmit={(event) => void saveGroup(event)}
            >
              <label htmlFor="rename-group">Novo nome do grupo</label>
              <input
                id="rename-group"
                autoFocus
                maxLength={40}
                value={groupDraft}
                onChange={(event) => setGroupDraft(event.target.value)}
              />
              <button type="submit" className="btn small">
                Salvar nome
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const id = editingGroup;
                  setEditingGroup(null);
                  setGroupDraft('');
                  document.querySelector<HTMLButtonElement>(`[data-group-edit="${id}"]`)?.focus();
                }}
              >
                Cancelar
              </button>
            </form>
          )}
          {formOpen && (
            <form
              ref={formRef}
              className="form"
              aria-labelledby="form-title"
              onSubmit={(e) => void save(e)}
            >
              <h2 id="form-title">{editing === null ? 'Novo serviço' : 'Editar serviço'}</h2>
              <div className="fields">
                <label>
                  Nome
                  <input
                    ref={nameInput}
                    required
                    maxLength={80}
                    autoComplete="off"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Jellyfin"
                  />
                </label>
                <label>
                  URL
                  <input
                    type="url"
                    inputMode="url"
                    required
                    autoComplete="off"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="http://192.168.1.10:8096"
                  />
                </label>
                <label>
                  Categoria
                  <input
                    required
                    maxLength={40}
                    list="categories"
                    autoComplete="off"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Mídia"
                  />
                  <datalist id="categories">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Descrição <small>opcional</small>
                  <input
                    maxLength={140}
                    autoComplete="off"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Filmes e séries"
                  />
                </label>
                <label>
                  Ícone <small>emoji opcional</small>
                  <input
                    maxLength={8}
                    value={form.icon ?? ''}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="🎬"
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.allowPrivate === true}
                    onChange={(e) => setForm({ ...form, allowPrivate: e.target.checked })}
                  />
                  Permitir monitoramento em rede privada
                  <small>Autoriza apenas RFC1918 e ULA para este serviço.</small>
                </label>
              </div>
              <p className="form-error" role="alert">
                {error}
              </p>
              <div className="actions">
                <button type="button" className="btn quiet" onClick={closeForm}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {editing === null ? 'Salvar serviço' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          )}
          <div className="notice" id="message" role="status">
            {message}
          </div>
          {services.length > 0 && (
            <div className="filters" role="group" aria-label="Filtrar por categoria">
              {[null, ...categories].map((category) => (
                <button
                  key={category === null ? '__all__' : `category:${category}`}
                  className="chip"
                  aria-pressed={selected === category}
                  onClick={() => setSelected(category)}
                >
                  {category ?? 'Todos'}
                  <small aria-hidden="true">
                    {category === null
                      ? services.length
                      : services.filter((s) => s.category === category).length}
                  </small>
                </button>
              ))}
            </div>
          )}
          {groups.map(({ category, items }) => (
            <section className="group" key={category} aria-labelledby={`group:${category}`}>
              <div className="group-title">
                <h2 id={`group:${category}`}>
                  {category} <small>{items.length}</small>
                </h2>
                <div className="group-order">
                  {groupRows.find((group) => group.name === category) && (
                    <>
                      <button
                        data-group-edit={groupRows.find((group) => group.name === category)?.id}
                        className="btn small"
                        type="button"
                        aria-label={`Renomear grupo ${category}`}
                        onClick={() => {
                          const group = groupRows.find((item) => item.name === category)!;
                          setEditingGroup(group.id);
                          setGroupDraft(group.name);
                        }}
                      >
                        Renomear
                      </button>
                      {!services.some((service) => service.category === category) && (
                        <button
                          className="btn small danger"
                          type="button"
                          aria-label={`Remover grupo ${category}`}
                          onClick={() =>
                            void deleteGroup(groupRows.find((item) => item.name === category)!)
                          }
                        >
                          Remover
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="btn small"
                    type="button"
                    aria-label={`Mover grupo ${category} para cima`}
                    onClick={() => void moveGroup(category, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    aria-label={`Mover grupo ${category} para baixo`}
                    onClick={() => void moveGroup(category, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
              {!items.length && <p className="empty-group">Este grupo ainda não tem cards.</p>}
              <ul className="list">
                {items.map((s) => (
                  <li
                    className={`row${menu === s.id ? ' open' : ''}${confirming === s.id ? ' confirming' : ''}`}
                    key={s.id}
                  >
                    <span className="mono" aria-hidden="true">
                      {s.icon || s.name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                    </span>
                    <span className="who">
                      <a
                        className="service-link"
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.name}
                        <span className="sr"> (abre em nova aba)</span>
                      </a>
                      <span className="desc">
                        {s.description && `${s.description} · `}
                        <span className="addr">{hostOf(s.url)}</span>
                      </span>
                      <span
                        className={`availability ${serviceStatuses[s.id]?.status ?? 'unknown'}`}
                      >
                        {serviceStatuses[s.id]?.status === 'available'
                          ? 'Disponível'
                          : serviceStatuses[s.id]?.status === 'unavailable'
                            ? 'Indisponível'
                            : 'Estado desconhecido'}
                        {serviceStatuses[s.id]?.lastAttempt && (
                          <time dateTime={serviceStatuses[s.id].lastAttempt!}>
                            {' · última tentativa '}
                            {new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(serviceStatuses[s.id].lastAttempt!))}
                          </time>
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="ibtn more"
                      aria-expanded={menu === s.id}
                      aria-label={`Ações de ${s.name}`}
                      onClick={() => {
                        setMenu(menu === s.id ? null : s.id);
                        setConfirming(null);
                      }}
                    >
                      <Icon name="more" />
                    </button>
                    <span className="tools">
                      <button
                        data-service-edit={s.id}
                        type="button"
                        className="btn small"
                        aria-label={`Editar ${s.name}`}
                        onClick={() => openForm(s)}
                      >
                        <Icon name="edit" />
                        <span className="lbl">Editar</span>
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Mover ${s.name} para cima`}
                        onClick={() => void moveService(s, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Mover ${s.name} para baixo`}
                        onClick={() => void moveService(s, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        aria-label={
                          confirming === s.id
                            ? `Confirmar remoção de ${s.name}`
                            : `Remover ${s.name}`
                        }
                        onClick={() => void remove(s)}
                        onBlur={() => setConfirming((c) => (c === s.id ? null : c))}
                      >
                        <Icon name="trash" />
                        <span className="lbl">
                          {confirming === s.id ? 'Confirmar remoção' : 'Remover'}
                        </span>
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length && (
            <div className="empty">
              <h3>{services.length ? 'Nenhum serviço encontrado' : 'Seu painel está vazio'}</h3>
              <p>
                {services.length
                  ? 'Experimente outro termo ou escolha “Todos”.'
                  : 'Adicione o primeiro serviço para abrir tudo a partir daqui.'}
              </p>
              {!services.length && (
                <button type="button" className="btn primary" onClick={() => openForm()}>
                  <Icon name="plus" />
                  Adicionar primeiro serviço
                </button>
              )}
            </div>
          )}
        </section>
        <aside>
          <section className="panel p-integrations" aria-label="Integrações">
            <div className="block">
              <Proxmox />
            </div>
            <div className="block connections">
              <Connections />
            </div>
            <IntegrationCatalog />
          </section>
        </aside>
        <section
          className="panel p-proposals"
          aria-label="Propostas do agente"
          hidden={tab !== 'proposals'}
        >
          <div className="title">
            <div>
              <h1>Propostas de cards</h1>
              <p className="lede">Revise cada alteração antes de aplicá-la.</p>
            </div>
            <button className="btn" onClick={() => void loadProposals()}>
              Atualizar
            </button>
          </div>
          <label>
            Nome do agente
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={agentScopes.includes('services:read')}
              onChange={(e) =>
                setAgentScopes((s) =>
                  e.target.checked
                    ? [...new Set([...s, 'services:read'])]
                    : s.filter((x) => x !== 'services:read'),
                )
              }
            />{' '}
            Ler serviços
          </label>
          <label>
            <input
              type="checkbox"
              checked={agentScopes.includes('proxmox:read')}
              onChange={(e) =>
                setAgentScopes((s) =>
                  e.target.checked
                    ? [...new Set([...s, 'proxmox:read'])]
                    : s.filter((x) => x !== 'proxmox:read'),
                )
              }
            />{' '}
            Ler recursos Proxmox
          </label>
          <label>
            <input
              type="checkbox"
              checked={agentScopes.includes('proposals:create')}
              onChange={(e) =>
                setAgentScopes((s) =>
                  e.target.checked
                    ? [...new Set([...s, 'proposals:create'])]
                    : s.filter((x) => x !== 'proposals:create'),
                )
              }
            />{' '}
            Criar propostas
          </label>
          <button className="btn" onClick={() => void createAgent()}>
            Criar identidade
          </button>
          {newAgentToken && (
            <p role="alert">
              Copie o token agora; ele não será exibido novamente: <code>{newAgentToken}</code>
            </p>
          )}
          <h2>Identidades</h2>
          {agents.map((agent) => (
            <article key={agent.id}>
              <strong>{agent.name}</strong> · {JSON.parse(agent.scopes).join(', ')} ·{' '}
              {agent.revokedAt ? 'revogada' : 'ativa'}
              {!agent.revokedAt && (
                <div>
                  <button className="btn" onClick={() => void rotateAgent(agent.id)}>
                    Rotacionar token
                  </button>{' '}
                  <button className="btn" onClick={() => void revokeAgent(agent.id)}>
                    Revogar
                  </button>
                </div>
              )}
            </article>
          ))}
          {proposals.map((p) => (
            <article key={p.id}>
              <h2>{p.state}</h2>
              <pre>{p.diff}</pre>
              <small>Expira: {new Date(p.expiresAt).toLocaleString()}</small>
              {p.state === 'pending' && (
                <div>
                  <button className="btn primary" onClick={() => void reviewProposal(p.id, true)}>
                    Aprovar
                  </button>{' '}
                  <button className="btn" onClick={() => void reviewProposal(p.id, false)}>
                    Rejeitar
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      </main>
      <div className="wrap">
        <footer>Homora · ambiente local, acessível somente nesta máquina</footer>
      </div>
      <nav className="tabs" aria-label="Seções">
        <button
          type="button"
          aria-current={tab === 'services' ? 'page' : undefined}
          onClick={() => setTab('services')}
        >
          <Icon name="list" />
          Serviços
        </button>
        <button
          type="button"
          aria-current={tab === 'proposals' ? 'page' : undefined}
          onClick={() => {
            setTab('proposals');
            void loadProposals();
            void loadAgents();
          }}
        >
          <Icon name="list" />
          Propostas
        </button>
        <button
          type="button"
          aria-current={tab === 'integrations' ? 'page' : undefined}
          onClick={() => setTab('integrations')}
        >
          <Icon name="server" />
          Integrações
        </button>
      </nav>
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<{ configured: boolean; authenticated: boolean } | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setStatus)
      .catch(() => setError('Não foi possível conectar ao servidor.'));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (!status?.configured) {
        const setup = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!setup.ok)
          throw new Error('Não foi possível criar a conta. Use pelo menos 8 caracteres.');
        setStatus({ configured: true, authenticated: false });
      }
      const login = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!login.ok)
        throw new Error('Senha inválida ou muitas tentativas. Tente novamente mais tarde.');
      setPassword('');
      setStatus({ configured: true, authenticated: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de conexão.');
    }
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setStatus({ configured: true, authenticated: false });
  }
  if (status?.authenticated) return <Dashboard onLogout={() => void logout()} />;
  return (
    <main className="auth-page">
      <div className="auth-box">
        <div className="wordmark">
          <Icon name="mark" />
          <span>Homora</span>
        </div>
        {status ? (
          <>
            <h1>{status.configured ? 'Bem-vindo de volta.' : 'Crie sua senha.'}</h1>
            <p>
              {status.configured
                ? 'Entre para acessar seus serviços.'
                : 'Configure o acesso de administrador deste Homora.'}
            </p>
            <form onSubmit={(e) => void submit(e)}>
              <label>
                Senha
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={1024}
                  autoComplete={status.configured ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p role="alert">{error}</p>
              <button className="btn primary" type="submit">
                {status.configured ? 'Entrar' : 'Criar conta'}
              </button>
            </form>
          </>
        ) : (
          <p role="status">{error || 'Conectando...'}</p>
        )}
      </div>
    </main>
  );
}
