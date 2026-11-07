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
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const response = await fetch('/api/proxmox/resources');
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(
          typeof body?.error === 'string' ? body.error : 'Não foi possível consultar o Proxmox.',
        );
      }
      const body = (await response.json()) as { data: unknown };
      if (!Array.isArray(body.data)) throw Error();
      setResources(body.data as Resource[]);
      setMessage('');
    } catch (error) {
      setResources(null);
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
  return (
    <article className="widget integration-placeholder">
      <div className="widget-head">
        <span>◈ &nbsp; PROXMOX</span>
        <span>{configured ? 'CONFIGURADO' : 'NÃO CONFIGURADO'}</span>
      </div>
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
          {configured && <p>Deixe os campos em branco para manter os dados existentes.</p>}
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
          <p>
            Para a CA padrão do Proxmox, importe o arquivo público /etc/pve/pve-root-ca.pem obtido
            de fonte confiável. A URL deve corresponder ao certificado.
          </p>
          {hasCa && (
            <label>
              <input
                type="checkbox"
                checked={removeCa}
                onChange={(event) => setRemoveCa(event.target.checked)}
              />{' '}
              Remover CA importada
            </label>
          )}
          <button
            type="button"
            className="cancel"
            disabled={busy}
            onClick={(event) => void submit(event, true)}
          >
            Testar conexão
          </button>{' '}
          <button className="primary" disabled={busy}>
            Salvar integração
          </button>{' '}
          <button className="cancel" type="button" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <h3>Sua infraestrutura, em um só lugar</h3>
          {resources ? (
            <>
              <p>
                {resources.filter((r) => r.type === 'node').length} nós ·{' '}
                {resources.filter((r) => r.type === 'qemu').length} VMs ·{' '}
                {resources.filter((r) => r.type === 'lxc').length} containers
              </p>
              <p>
                {resources.filter((r) => r.status === 'running' || r.status === 'online').length}{' '}
                recursos ativos
              </p>
            </>
          ) : (
            <p>
              {configured
                ? 'Os recursos não estão disponíveis no momento.'
                : 'Conecte um token de leitura para ver seus nós, máquinas virtuais e containers.'}
            </p>
          )}
          <button className="cancel integration-action" onClick={() => setEditing(true)}>
            {configured ? 'Alterar integração' : 'Configurar Proxmox'}
          </button>
          {configured && (
            <button className="cancel integration-action" onClick={() => void refresh()}>
              Atualizar
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
