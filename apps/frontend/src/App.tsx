import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Proxmox } from './Proxmox';
import { IntegrationCatalog } from './IntegrationCatalog';

const empty: ServiceInput = { name: '', url: '', category: '', description: '' };
const colors = ['orange', 'blue', 'green', 'purple', 'rose', 'cyan', 'sky', 'lime'];
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ServiceInput>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [time, setTime] = useState(new Date());
  const dialog = useRef<HTMLDialogElement>(null);
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
    const timer = setInterval(() => setTime(new Date()), 30000);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const filtered = services.filter(
    (s) =>
      (selected === null || s.category === selected) &&
      `${s.name} ${s.category} ${s.description}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR').trim()),
  );
  function openForm(service?: Service) {
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
    dialog.current?.showModal();
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
      dialog.current?.close();
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }
  async function remove(s: Service) {
    if (!confirm(`Remover ${s.name}?`)) return;
    try {
      const response = await fetch(`/api/services/${s.id}`, { method: 'DELETE' });
      if (!response.ok) throw Error();
      setSelected(null);
      await refresh();
    } catch {
      setMessage('Não foi possível remover o serviço.');
    }
  }
  return (
    <div className="site">
      <header className="topbar">
        <a className="wordmark" href="/">
          <span>✳</span> homora
        </a>
        <nav>
          <a className="selected" href="#inicio">
            Visão geral
          </a>
          <a href="#servicos">Aplicativos</a>
          <a href="#widgets">Meu ambiente</a>
        </nav>
        <div className="top-right">
          <span className="local-pill">
            <i /> AMBIENTE LOCAL
          </span>
          <button type="button" className="profile" onClick={onLogout} aria-label="Sair">
            H
          </button>
        </div>
      </header>
      <main id="inicio">
        <div className="hero">
          <div>
            <div className="eyebrow">SEU ESPAÇO / VISÃO GERAL</div>
            <h1>
              Seu espaço, conectado<span>.</span>
            </h1>
            <p>Seus aplicativos, serviços e informações. Tudo por aqui.</p>
          </div>
          <div className="hero-right">
            <strong>
              {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
                time,
              )}
            </strong>
            <small>
              {new Intl.DateTimeFormat('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(time)}
            </small>
          </div>
        </div>
        <div className="search-row">
          <label className="search">
            <span>⌕</span>
            <input
              ref={search}
              type="search"
              placeholder="Buscar aplicativos e serviços..."
              aria-label="Buscar aplicativos e serviços"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <span className="search-hint">✳ &nbsp; Seu espaço, do seu jeito</span>
        </div>
        <section id="servicos">
          <div className="section-heading">
            <div>
              <div className="eyebrow">SEU PONTO DE PARTIDA</div>
              <h2>
                Seus aplicativos <sup>{String(services.length).padStart(2, '0')}</sup>
              </h2>
              <p>Abra o que você precisa, quando precisar.</p>
            </div>
            <button className="primary" onClick={() => openForm()}>
              ＋ &nbsp; Adicionar serviço
            </button>
          </div>
          <div className="filters" aria-label="Filtrar aplicativos">
            {[null, ...categories].map((category) => (
              <button
                key={category === null ? '__all__' : `category:${category}`}
                className={selected === category ? 'active' : ''}
                aria-pressed={selected === category}
                onClick={() => setSelected(category)}
              >
                {category ?? 'Todos'}
              </button>
            ))}
          </div>
          <div id="message" role="status">
            {message}
          </div>
          <div className="app-grid">
            {filtered.length ? (
              filtered.map((s) => (
                <article className="service-card" key={s.id}>
                  <a
                    className="app-card service-link"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span
                      className={`app-icon ${colors[Array.from(s.name).reduce((n, c) => n + (c.codePointAt(0) ?? 0), 0) % colors.length]}`}
                    >
                      {s.name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                    </span>
                    <span className="app-info">
                      <b>{s.name}</b>
                      <small>{s.description || s.category}</small>
                    </span>
                    <span className="arrow">↗</span>
                  </a>
                  <div className="card-actions">
                    <button aria-label={`Editar ${s.name}`} onClick={() => openForm(s)}>
                      Editar
                    </button>
                    <button aria-label={`Remover ${s.name}`} onClick={() => void remove(s)}>
                      Remover
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <span className="empty-icon">✳</span>
                <h3>{services.length ? 'Nenhum serviço encontrado' : 'Seu espaço começa aqui'}</h3>
                <p>
                  {services.length
                    ? 'Experimente outra busca ou categoria.'
                    : 'Adicione seu primeiro serviço para acessar tudo em um só lugar.'}
                </p>
                {!services.length && (
                  <button className="primary" onClick={() => openForm()}>
                    ＋ Adicionar primeiro serviço
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        <section id="widgets">
          <div className="section-heading">
            <div>
              <div className="eyebrow">ACOMPANHE DE PERTO</div>
              <h2>Seu ambiente</h2>
              <p>Acompanhe suas integrações e recursos disponíveis.</p>
            </div>
          </div>
          <div className="widgets">
            <Proxmox />
            <IntegrationCatalog />
            {[
              [
                '◉  MONITORAMENTO',
                'Veja seus serviços de perto',
                'Disponibilidade e informações das suas integrações aparecerão aqui.',
              ],
              [
                '✳  ASSISTENTE',
                'Gerencie com ajuda de IA',
                'A integração MCP permitirá consultar e propor mudanças no seu espaço.',
              ],
            ].map(([title, heading, description]) => (
              <article className="widget integration-placeholder" key={title}>
                <div className="widget-head">
                  <span>{title}</span>
                  <span>PLANEJADO</span>
                </div>
                <h3>{heading}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="footer">
          ✳ &nbsp; HOMORA <span>Seu espaço, conectado. &nbsp; · &nbsp; Ambiente local</span>
        </footer>
      </main>
      <dialog ref={dialog}>
        <form onSubmit={(e) => void save(e)}>
          <div className="modal-head">
            <div>
              <div className="eyebrow">SEU ESPAÇO</div>
              <h2>{editing === null ? 'Adicionar serviço' : 'Editar serviço'}</h2>
              <p>Guarde um atalho para acessar quando precisar.</p>
            </div>
            <button
              type="button"
              className="close"
              aria-label="Fechar"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          <label>
            Nome
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Jellyfin"
            />
          </label>
          <label>
            URL
            <input
              type="url"
              required
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
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ex.: Entretenimento"
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
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Uma breve descrição"
            />
          </label>
          <p id="form-error" role="alert">
            {error}
          </p>
          <div className="modal-actions">
            <button type="button" className="cancel" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {editing === null ? 'Adicionar serviço' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </dialog>
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
          <span>✳</span> homora
        </div>
        {status ? (
          <>
            <h1>{status.configured ? 'Bem-vindo de volta.' : 'Crie sua senha.'}</h1>
            <p>
              {status.configured
                ? 'Entre para acessar seu espaço.'
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
              <button className="primary" type="submit">
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
