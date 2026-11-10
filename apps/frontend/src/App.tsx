import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Icon, type IconName } from './icons';
import { IntegrationCatalog } from './IntegrationCatalog';
import { Proxmox } from './Proxmox';
import { Connections } from './Connections';
import { Agents } from './Agents';

const empty: ServiceInput = {
  name: '',
  url: '',
  category: '',
  description: '',
  allowPrivate: false,
};
type ServiceGroup = { id: number; name: string; position: number };
type Tab = 'services' | 'integrations' | 'agents';
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

// Endereços que a política de rede do monitor só consulta com autorização explícita.
function isPrivateHost(url: string) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)) return true;
  return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
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
  const [organizing, setOrganizing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<number | undefined>(undefined);
  function announce(text: string) {
    setFlash(text);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 5000);
  }
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
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
      const wasNew = editing === null;
      closeForm();
      setSelected(null);
      await refresh();
      announce(wasNew ? 'Serviço adicionado.' : 'Alterações salvas.');
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
      announce('Serviço removido.');
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
  const sortedIn = (category: string) =>
    services
      .filter((item) => item.category === category)
      .sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'pt-BR'),
      );
  async function placeService(service: Service, to: number) {
    const ordered = sortedIn(service.category);
    const from = ordered.findIndex((item) => item.id === service.id);
    if (from < 0 || to < 0 || to >= ordered.length || to === from) return;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
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
  function moveService(service: Service, direction: -1 | 1) {
    const ordered = sortedIn(service.category);
    return placeService(service, ordered.findIndex((item) => item.id === service.id) + direction);
  }
  const total = services.length;
  const blockedIds = new Set(
    services.filter((s) => s.allowPrivate !== true && isPrivateHost(s.url)).map((s) => s.id),
  );
  const online = services.filter((s) => serviceStatuses[s.id]?.status === 'available').length;
  const down = services.filter(
    (s) => serviceStatuses[s.id]?.status === 'unavailable' && !blockedIds.has(s.id),
  ).length;
  const blocked = services.filter(
    (s) => blockedIds.has(s.id) && serviceStatuses[s.id]?.status !== 'available',
  ).length;
  const monitored = total - blocked;
  const healthParts = [
    down
      ? `${online} no ar e ${down} fora do ar`
      : online > 0
        ? online === monitored
          ? 'Tudo no ar por aqui'
          : `${online} no ar`
        : '',
    blocked ? `${blocked} sem monitoramento (rede privada não autorizada)` : '',
  ].filter(Boolean);
  const healthSummary =
    Object.keys(serviceStatuses).length && healthParts.length
      ? `. ${healthParts.join('. ')}.`
      : '.';
  const navItems: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'services', label: 'Serviços', icon: 'grid' },
    { id: 'integrations', label: 'Integrações', icon: 'server' },
    { id: 'agents', label: 'Agentes', icon: 'agent' },
  ];
  const renderNav = (className: string, label: string, withIcons: boolean) => (
    <nav className={className} aria-label={label}>
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => setTab(item.id)}
        >
          {withIcons && <Icon name={item.icon} />}
          {item.label}
        </button>
      ))}
    </nav>
  );
  function statusLabel(id: number) {
    if (blockedIds.has(id) && serviceStatuses[id]?.status !== 'available')
      return 'Monitoramento bloqueado';
    const status = serviceStatuses[id]?.status;
    return status === 'available'
      ? 'Disponível'
      : status === 'unavailable'
        ? 'Indisponível'
        : 'Sem informação';
  }
  return (
    <div className="shell" data-tab={tab}>
      <header className="top">
        <div className="wrap">
          <a className="wordmark" href="/" aria-label="Homora, início">
            <Icon name="mark" />
            <span>Homora</span>
          </a>
          {renderNav('desktop-nav', 'Navegação principal', false)}
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
                {total
                  ? `${total} ${total === 1 ? 'serviço' : 'serviços'} em ${categories.length} ${categories.length === 1 ? 'grupo' : 'grupos'}${healthSummary}`
                  : 'Reúna aqui os serviços da sua casa e abra qualquer um com um clique.'}
              </p>
            </div>
            <div className="title-actions">
              <button
                type="button"
                className="btn"
                aria-pressed={organizing}
                onClick={() => {
                  setOrganizing(!organizing);
                  setMenu(null);
                  setConfirming(null);
                }}
              >
                <Icon name="sliders" />
                {organizing ? 'Concluir' : 'Organizar'}
              </button>
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
          </div>
          {organizing && (
            <div className="organize-bar" role="group" aria-label="Modo organizar">
              <p>
                <Icon name="sliders" />
                <span>
                  Você está organizando. Arraste os cards ou use as setas para mudar a ordem e toque
                  em Concluir ao terminar.
                </span>
              </p>
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
            </div>
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
                  <small>
                    Útil para endereços da sua rede local, como 192.168.x.x. Vale só para este
                    serviço.
                  </small>
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
          {flash && (
            <div className="flash" role="status">
              <Icon name="check" />
              {flash}
            </div>
          )}
          {!organizing && services.length > 0 && categories.length > 1 && (
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
          {groups.map(({ category, items }) => {
            const groupRow = groupRows.find((group) => group.name === category);
            return (
              <section className="group" key={category} aria-labelledby={`group:${category}`}>
                <div className="group-title">
                  <h2 id={`group:${category}`}>
                    {category} <small>{items.length}</small>
                  </h2>
                  {organizing && (
                    <div className="group-order">
                      {groupRow && (
                        <>
                          <button
                            data-group-edit={groupRow.id}
                            className="btn small quiet"
                            type="button"
                            aria-label={`Renomear grupo ${category}`}
                            onClick={() => {
                              setEditingGroup(groupRow.id);
                              setGroupDraft(groupRow.name);
                            }}
                          >
                            Renomear
                          </button>
                          {!services.some((service) => service.category === category) && (
                            <button
                              className="btn small quiet danger"
                              type="button"
                              aria-label={`Remover grupo ${category}`}
                              onClick={() => void deleteGroup(groupRow)}
                            >
                              Remover
                            </button>
                          )}
                        </>
                      )}
                      <button
                        className="ibtn compact"
                        type="button"
                        aria-label={`Mover grupo ${category} para cima`}
                        onClick={() => void moveGroup(category, -1)}
                      >
                        <Icon name="up" />
                      </button>
                      <button
                        className="ibtn compact"
                        type="button"
                        aria-label={`Mover grupo ${category} para baixo`}
                        onClick={() => void moveGroup(category, 1)}
                      >
                        <Icon name="down" />
                      </button>
                    </div>
                  )}
                </div>
                {!items.length && <p className="empty-group">Este grupo ainda não tem cards.</p>}
                <ul className="list service-grid">
                  {items.map((s) => {
                    const info = serviceStatuses[s.id];
                    const state = info?.status ?? 'unknown';
                    const isBlocked = blockedIds.has(s.id) && state !== 'available';
                    return (
                      <li
                        className={`service-card${menu === s.id ? ' open' : ''}${confirming === s.id ? ' confirming' : ''}${organizing ? ' organizing' : ''}${dragging === s.id ? ' dragging' : ''}`}
                        key={s.id}
                        draggable={organizing}
                        onDragStart={(event) => {
                          setDragging(s.id);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(event) => {
                          if (dragging !== null && dragging !== s.id) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const dragged = services.find((item) => item.id === dragging);
                          setDragging(null);
                          if (!dragged || dragged.category !== s.category) return;
                          void placeService(
                            dragged,
                            sortedIn(s.category).findIndex((item) => item.id === s.id),
                          );
                        }}
                      >
                        <span className="service-icon" aria-hidden="true">
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
                          <span className="addr">{hostOf(s.url)}</span>
                        </span>
                        {s.description && <span className="desc">{s.description}</span>}
                        <span className={`availability ${isBlocked ? 'unknown' : state}`}>
                          {statusLabel(s.id)}
                          {isBlocked ? (
                            <small>Autorize a rede privada em Editar.</small>
                          ) : (
                            info?.lastAttempt &&
                            state !== 'available' && (
                              <time dateTime={info.lastAttempt}>
                                {' · última tentativa '}
                                {new Intl.DateTimeFormat('pt-BR', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                }).format(new Date(info.lastAttempt))}
                              </time>
                            )
                          )}
                        </span>
                        {organizing ? (
                          <span className="reorder">
                            <Icon name="grip" />
                            <button
                              type="button"
                              className="ibtn compact"
                              aria-label={`Mover ${s.name} para cima`}
                              onClick={() => void moveService(s, -1)}
                            >
                              <Icon name="up" />
                            </button>
                            <button
                              type="button"
                              className="ibtn compact"
                              aria-label={`Mover ${s.name} para baixo`}
                              onClick={() => void moveService(s, 1)}
                            >
                              <Icon name="down" />
                            </button>
                          </span>
                        ) : (
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
                        )}
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
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {!groups.length && (
            <div className="empty">
              <h2>{services.length ? 'Nenhum serviço encontrado' : 'Seu painel está vazio'}</h2>
              <p>
                {services.length
                  ? 'Experimente outro termo ou escolha “Todos”.'
                  : 'Comece pelo serviço que você mais abre. Depois é só ir juntando o resto.'}
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
            <div className="integration-page-header">
              <h1>Integrações</h1>
              <p className="lede">
                Conecte o Proxmox e outros serviços para ver o estado do seu homelab aqui.
              </p>
            </div>
            <div className="block integration-card proxmox-card">
              <Proxmox />
            </div>
            <div className="block integration-card connections-card">
              <Connections />
            </div>
            <IntegrationCatalog />
          </section>
        </aside>
        <section className="panel p-agents" aria-label="Agentes" hidden={tab !== 'agents'}>
          {tab === 'agents' && <Agents services={services} onApplied={refresh} />}
        </section>
      </main>
      <div className="wrap">
        <footer>Homora · ambiente local, acessível somente nesta máquina</footer>
      </div>
      {renderNav('tabs', 'Seções', true)}
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
