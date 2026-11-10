import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Kind = 'jellyfin' | 'home-assistant' | 'uptime-kuma' | 'adguard-home';
type Connection = {
  id: number;
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  hasSecret: boolean;
  hasCa: boolean;
  entityId?: string;
  username?: string;
  slug?: string;
};
type Form = {
  type: Kind;
  name: string;
  url: string;
  allowPrivate: boolean;
  secret: string;
  ca: string;
  removeCa: boolean;
  entityId: string;
  username: string;
  slug: string;
};
const labels: Record<Kind, string> = {
  jellyfin: 'Jellyfin',
  'home-assistant': 'Home Assistant',
  'uptime-kuma': 'Uptime Kuma',
  'adguard-home': 'AdGuard Home',
};
const empty: Form = {
  type: 'jellyfin',
  name: '',
  url: '',
  allowPrivate: false,
  secret: '',
  ca: '',
  removeCa: false,
  entityId: '',
  username: '',
  slug: '',
};
async function request(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
    throw new Error(
      typeof message === 'string' ? message : 'Não foi possível concluir a operação.',
    );
  }
  return data;
}

function describeData(type: Kind, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const text = (v: unknown) => typeof v === 'string' && v.length <= 1024;
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  switch (type) {
    case 'jellyfin':
      return text(data.name) && text(data.version)
        ? `Servidor: ${data.name} · Versão: ${data.version}`
        : null;
    case 'home-assistant':
      return text(data.entityId) && text(data.state)
        ? `Entidade: ${data.entityId} · Estado: ${data.state}`
        : null;
    case 'uptime-kuma':
      return [data.up, data.down, data.pending, data.maintenance, data.unknown].every(count)
        ? `Ativos: ${data.up} · Indisponíveis: ${data.down} · Pendentes: ${data.pending} · Manutenção: ${data.maintenance} · Desconhecidos: ${data.unknown}`
        : null;
    case 'adguard-home':
      return typeof data.running === 'boolean' &&
        typeof data.protectionEnabled === 'boolean' &&
        text(data.version)
        ? `Serviço: ${data.running ? 'ativo' : 'parado'} · Proteção: ${data.protectionEnabled ? 'ativa' : 'desativada'} · Versão: ${data.version}`
        : null;
  }
}

export function Connections() {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ id: number; data: unknown; checkedAt?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const data = await request('/api/connections');
    if (!Array.isArray(data)) throw new Error('Resposta inválida do servidor.');
    setItems(data as Connection[]);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    request('/api/connections', { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Resposta inválida.');
        if (!controller.signal.aborted) setItems(data as Connection[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setMessage('Não foi possível carregar as integrações.');
        }
      });
    return () => controller.abort();
  }, []);
  function edit(item: Connection) {
    setEditing(item.id);
    setForm({
      ...empty,
      type: item.type,
      name: item.name,
      url: item.url,
      allowPrivate: item.allowPrivate,
      entityId: item.entityId ?? '',
      username: item.username ?? '',
      slug: item.slug ?? '',
    });
    setMessage('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage('');
    try {
      const payload = {
        type: form.type,
        name: form.name,
        url: form.url,
        allowPrivate: form.allowPrivate,
        ...(form.secret ? { secret: form.secret } : {}),
        ...(form.ca ? { ca: form.ca } : {}),
        ...(form.removeCa ? { removeCa: true } : {}),
        ...(form.type === 'home-assistant' ? { entityId: form.entityId } : {}),
        ...(form.type === 'adguard-home' ? { username: form.username } : {}),
        ...(form.type === 'uptime-kuma' ? { slug: form.slug } : {}),
      };
      await request(editing === null ? '/api/connections' : `/api/connections/${editing}`, {
        method: editing === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setForm(null);
      setEditing(null);
      setResult(null);
      await load();
      setMessage('Integração salva.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  async function action(item: Connection, operation: 'test' | 'data' | 'delete') {
    if (operation === 'delete' && !window.confirm(`Remover a integração ${item.name}?`)) return;
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      if (operation === 'delete') {
        await request(`/api/connections/${item.id}`, { method: 'DELETE' });
        await load();
        setMessage('Integração removida.');
      } else if (operation === 'test') {
        await request(`/api/connections/${item.id}/test`, { method: 'POST' });
        setMessage(`Conexão com ${item.name} realizada com sucesso.`);
      } else {
        const response = (await request(`/api/connections/${item.id}/data?refresh=true`)) as {
          data: unknown;
          checkedAt?: string;
        };
        setResult({ id: item.id, ...response });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="widget integration-placeholder">
      <div className="widget-head">
        <span>◈ &nbsp; CONEXÕES</span>
        <span>INTEGRAÇÕES</span>
      </div>
      <h3>Suas integrações</h3>
      <p>Conecte serviços para consultar informações. A verificação TLS permanece ativa.</p>
      {form ? (
        <form onSubmit={(event) => void save(event)}>
          <label>
            Tipo de serviço
            <select
              value={form.type}
              disabled={editing !== null}
              onChange={(event) => setForm({ ...empty, type: event.target.value as Kind })}
            >
              {Object.entries(labels).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            URL do serviço
            <input
              type="url"
              required
              value={form.url}
              placeholder="https://servico.exemplo:443"
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </label>
          {form.type === 'home-assistant' && (
            <label>
              Entidade
              <input
                required
                value={form.entityId}
                placeholder="sensor.temperatura"
                onChange={(event) => setForm({ ...form, entityId: event.target.value })}
              />
            </label>
          )}
          {form.type === 'uptime-kuma' && (
            <label>
              Identificador da página pública
              <input
                required
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
              />
            </label>
          )}
          {form.type === 'adguard-home' && (
            <label>
              Usuário
              <input
                required
                autoComplete="username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
            </label>
          )}
          {(form.type === 'home-assistant' || form.type === 'adguard-home') && (
            <label>
              {form.type === 'home-assistant' ? 'Token de acesso' : 'Senha'}
              <input
                type="password"
                required={editing === null}
                autoComplete="new-password"
                value={form.secret}
                onChange={(event) => setForm({ ...form, secret: event.target.value })}
              />
            </label>
          )}
          {editing !== null && (form.type === 'home-assistant' || form.type === 'adguard-home') && (
            <p>
              Deixe o segredo vazio para mantê-lo. Se alterar endereço ou usuário, informe-o
              novamente.
            </p>
          )}
          <label>
            Certificado público da CA (opcional, PEM)
            <input
              type="file"
              accept=".pem,.crt,.cer"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setForm({ ...form, ca: '' });
                if (!file) return;
                if (file.size > 65536) {
                  setMessage('O certificado deve ter no máximo 64 KB.');
                  event.target.value = '';
                  return;
                }
                void file
                  .text()
                  .then((ca) =>
                    setForm((current) => (current ? { ...current, ca, removeCa: false } : current)),
                  )
                  .catch(() => setMessage('Não foi possível ler o certificado.'));
              }}
            />
          </label>
          {editing !== null && items?.find((item) => item.id === editing)?.hasCa && (
            <label>
              <input
                type="checkbox"
                checked={form.removeCa}
                onChange={(event) => setForm({ ...form, removeCa: event.target.checked })}
              />{' '}
              Remover CA importada
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={form.allowPrivate}
              onChange={(event) => setForm({ ...form, allowPrivate: event.target.checked })}
            />{' '}
            Permitir acesso à rede privada para este serviço
          </label>
          <p>
            Autorize a rede privada somente para um endereço de sua confiança. Credenciais exigem
            HTTPS.
          </p>
          <button type="submit" className="primary" disabled={busy}>
            Salvar conexão
          </button>{' '}
          <button
            type="button"
            className="cancel"
            disabled={busy}
            onClick={() => {
              setForm(null);
              setMessage('');
            }}
          >
            Cancelar
          </button>
        </form>
      ) : (
        <>
          {items === null && loadFailed ? (
            <button
              type="button"
              className="cancel"
              onClick={() => {
                setLoadFailed(false);
                setMessage('');
                void load().catch(() => {
                  setLoadFailed(true);
                  setMessage('Não foi possível carregar as integrações.');
                });
              }}
            >
              Tentar carregar novamente
            </button>
          ) : items === null ? (
            <p>Carregando conexões...</p>
          ) : items.length === 0 ? (
            <p>Nenhuma conexão cadastrada.</p>
          ) : (
            <ul className="connection-list">
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong> <small>{labels[item.type] ?? item.type}</small>
                  <div>
                    <button
                      type="button"
                      className="cancel"
                      disabled={busy}
                      onClick={() => edit(item)}
                    >
                      Editar {item.name}
                    </button>{' '}
                    <button
                      type="button"
                      className="cancel"
                      disabled={busy}
                      onClick={() => void action(item, 'test')}
                    >
                      Testar {item.name}
                    </button>{' '}
                    <button
                      type="button"
                      className="cancel"
                      disabled={busy}
                      onClick={() => void action(item, 'data')}
                    >
                      Consultar {item.name}
                    </button>{' '}
                    <button
                      type="button"
                      className="cancel"
                      disabled={busy}
                      onClick={() => void action(item, 'delete')}
                    >
                      Remover {item.name}
                    </button>
                  </div>
                  {result?.id === item.id && (
                    <div>
                      <p>
                        Última atualização:{' '}
                        {result.checkedAt
                          ? new Date(result.checkedAt).toLocaleString('pt-BR')
                          : 'não informada'}
                      </p>
                      <p>
                        {describeData(item.type, result.data) ??
                          'O serviço retornou dados inválidos.'}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="primary integration-action"
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setMessage('');
            }}
          >
            Adicionar conexão
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
