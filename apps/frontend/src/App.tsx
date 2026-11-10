import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Icon } from './icons';
import { IntegrationCatalog } from './IntegrationCatalog';
import { Proxmox } from './Proxmox';
import { Connections } from './Connections';

const empty: ServiceInput = { name: '', url: '', category: '', description: '' };
type Tab = 'services' | 'integrations';

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
  const formRef = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  async function refresh() {
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw Error();
      setServices((await response.json()) as Service[]);
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
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName);
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
    if (formOpen) {
      formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      nameInput.current?.focus({ preventScroll: true });
    }
  }, [formOpen]);
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const filtered = services.filter(
    (s) =>
      (selected === null || s.category === selected) &&
      `${s.name} ${s.category} ${s.description} ${s.url}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR').trim()),
  );
  const groups = categories
    .map((category) => ({ category, items: filtered.filter((s) => s.category === category) }))
    .filter((group) => group.items.length);
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
          }
        : empty,
    );
    setError('');
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    addButton.current?.focus();
  }
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
    const first = filtered[0];
    if (first) window.open(first.url, '_blank', 'noopener,noreferrer');
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
              <h2 id={`group:${category}`}>
                {category} <small>{items.length}</small>
              </h2>
              <ul className="list">
                {items.map((s) => (
                  <li
                    className={`row${menu === s.id ? ' open' : ''}${confirming === s.id ? ' confirming' : ''}`}
                    key={s.id}
                  >
                    <span className="mono" aria-hidden="true">
                      {s.name.slice(0, 1).toLocaleUpperCase('pt-BR')}
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
