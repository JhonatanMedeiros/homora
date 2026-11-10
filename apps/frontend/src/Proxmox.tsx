import { useEffect, useState, type FormEvent } from 'react';
type Resource = {
  type?: string;
  status?: string;
  name?: string;
  node?: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
};
const gb = (bytes: number) =>
  (bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pct = (fraction: number) => Math.min(100, Math.max(0, Math.round(fraction * 100)));

export function Proxmox() {
  const [configured, setConfigured] = useState(false),
    [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(''),
    [tokenId, setTokenId] = useState(''),
    [secret, setSecret] = useState('');
  const [resources, setResources] = useState<Resource[] | null>(null),
    [message, setMessage] = useState('');
  const [ca, setCa] = useState(''),
    [hasCa, setHasCa] = useState(false),
    [removeCa, setRemoveCa] = useState(false),
    [busy, setBusy] = useState(false),
    [showAll, setShowAll] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  async function refresh(force = false) {
    try {
      const response = await fetch(`/api/proxmox/resources${force ? '?refresh=true' : ''}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof body?.error === 'string' ? body.error : 'Não foi possível consultar o Proxmox.',
        );
      }
      const body = (await response.json()) as { data: unknown; checkedAt?: unknown };
      if (!Array.isArray(body.data)) throw Error();
      setResources(body.data as Resource[]);
      setCheckedAt(
        typeof body.checkedAt === 'string' && !Number.isNaN(Date.parse(body.checkedAt))
          ? body.checkedAt
          : null,
      );
      setMessage('');
    } catch (error) {
      setResources(null);
      setCheckedAt(null);
      setMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : 'Não foi possível conectar ao servidor Homora.',
      );
    }
  }
  useEffect(() => {
    fetch('/api/proxmox/status')
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((status: { configured: boolean; hasCa?: boolean }) => {
        setConfigured(status.configured);
        setHasCa(Boolean(status.hasCa));
        if (status.configured) void refresh();
      })
      .catch(() => setMessage('Não foi possível carregar a integração.'));
  }, []);
  async function submit(event: FormEvent, test = false) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(test ? '/api/proxmox/test' : '/api/proxmox/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, tokenId, secret, ca, removeCa }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || 'Não foi possível salvar a configuração.');
      if (test) {
        setMessage('Conexão com o Proxmox realizada com sucesso.');
        return;
      }
      setSecret('');
      setHasCa(removeCa ? false : Boolean(ca) || hasCa);
      setCa('');
      setRemoveCa(false);
      setResources(null);
      setConfigured(true);
      setEditing(false);
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : 'Não foi possível conectar ao servidor Homora.',
      );
    } finally {
      setBusy(false);
    }
  }
  const nodes = resources?.filter((r) => r.type === 'node') ?? [];
  const guests = resources?.filter((r) => r.type === 'qemu' || r.type === 'lxc') ?? [];
  const shownGuests = showAll ? guests : guests.slice(0, 8);
  return (
    <>
      <h2>Proxmox</h2>
      <p className="meta">
        {configured ? 'Integração de somente leitura.' : 'Integração não configurada.'}
      </p>
      {editing ? (
        <form onSubmit={(e) => void submit(e)}>
          <label>
            URL HTTPS
            <input
              type="url"
              required={!configured}
              placeholder="https://pve.local:8006"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            ID do token
            <input
              required={!configured}
              placeholder="usuario@realm!token"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
            />
          </label>
          <label>
            Segredo do token
            <input
              type="password"
              required={!configured}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          {configured && (
            <p className="hint">
              Deixe os campos em branco para manter os dados existentes. Ao alterar a URL ou o ID do
              token, informe novamente o segredo.
            </p>
          )}
          <label>
            Certificado público da CA (opcional, PEM)
            <input
              type="file"
              accept=".pem,.crt,.cer"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setCa('');
                if (!file) return;
                if (file.size > 65536) {
                  setMessage('O certificado deve ter no máximo 64 KB.');
                  event.target.value = '';
                  return;
                }
                void file
                  .text()
                  .then((content) => {
                    setCa(content);
                    setRemoveCa(false);
                  })
                  .catch(() => setMessage('Não foi possível ler o certificado.'));
              }}
            />
          </label>
          <p className="hint">
            Para a CA padrão do Proxmox, importe o arquivo público /etc/pve/pve-root-ca.pem obtido
            de fonte confiável. A URL deve corresponder ao certificado.
          </p>
          {hasCa && (
            <label className="check">
              <input
                type="checkbox"
                checked={removeCa}
                onChange={(event) => setRemoveCa(event.target.checked)}
              />
              Remover CA importada
            </label>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={(event) => void submit(event, true)}
            >
              Testar conexão
            </button>
            <button className="btn primary" disabled={busy}>
              Salvar integração
            </button>
            <button className="btn quiet" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {resources ? (
            <>
              {nodes.map((node) => (
                <div className="node" key={node.name}>
                  <h3>{node.name}</h3>
                  {typeof node.cpu === 'number' && (
                    <div className="bar-row">
                      <div>
                        <b>CPU</b>
                        <span>{pct(node.cpu)}%</span>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${pct(node.cpu)}%` }} />
                      </div>
                    </div>
                  )}
                  {typeof node.mem === 'number' &&
                    typeof node.maxmem === 'number' &&
                    node.maxmem > 0 && (
                      <div className="bar-row">
                        <div>
                          <b>Memória</b>
                          <span>
                            {gb(node.mem)} de {gb(node.maxmem)} GB
                          </span>
                        </div>
                        <div className="bar">
                          <i style={{ width: `${pct(node.mem / node.maxmem)}%` }} />
                        </div>
                      </div>
                    )}
                </div>
              ))}
              <p className="meta">
                {nodes.length} {nodes.length === 1 ? 'nó' : 'nós'} ·{' '}
                {resources.filter((r) => r.type === 'qemu').length} VMs ·{' '}
                {resources.filter((r) => r.type === 'lxc').length} containers
              </p>
              {checkedAt && (
                <p className="meta">
                  Última atualização:{' '}
                  <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString('pt-BR')}</time>
                </p>
              )}
              {guests.length > 0 && (
                <ul className="res">
                  {shownGuests.map((g, index) => (
                    <li key={`${g.node}:${g.type}:${g.name ?? index}`}>
                      <span className="n">
                        {g.name ?? 'sem nome'}
                        <small>{g.type === 'qemu' ? 'VM' : 'CT'}</small>
                      </span>
                      <span className="st">
                        <i className={`dot${g.status === 'running' ? ' on' : ''}`} />
                        {g.status === 'running' ? 'ativo' : (g.status ?? 'desconhecido')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {guests.length > 8 && (
                <p>
                  <button
                    type="button"
                    className="btn quiet small"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Mostrar menos' : `Mostrar todos (${guests.length})`}
                  </button>
                </p>
              )}
            </>
          ) : (
            <p className="hint">
              {configured
                ? 'Os recursos não estão disponíveis no momento.'
                : 'Conecte um token de leitura para ver seus nós, máquinas virtuais e containers.'}
            </p>
          )}
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setEditing(true)}>
              {configured ? 'Alterar integração' : 'Configurar Proxmox'}
            </button>
            {configured && (
              <button className="btn quiet" onClick={() => void refresh(true)}>
                Atualizar
              </button>
            )}
          </div>
        </>
      )}
      {message && (
        <p className="notice" role="status" style={{ marginTop: 14 }}>
          {message}
        </p>
      )}
    </>
  );
}
