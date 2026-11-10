import { useEffect, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { SectionTitle } from '@/components/section-title';
import { ProxmoxForm } from './proxmox-form';
import { ProxmoxResources, type Resource } from './proxmox-resources';

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
  const caFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    setCa('');
    if (!file) return;
    if (file.size > 65536) {
      setMessage('O certificado deve ter no máximo 64 KB.');
      input.value = '';
      return;
    }
    void file
      .text()
      .then((content) => {
        setCa(content);
        setRemoveCa(false);
      })
      .catch(() => setMessage('Não foi possível ler o certificado.'));
  };
  return (
    <Card>
      <CardHeader>
        <SectionTitle>Proxmox</SectionTitle>
        <CardDescription>
          {configured ? 'Integração de somente leitura.' : 'Integração não configurada.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing ? (
          <ProxmoxForm
            configured={configured}
            hasCa={hasCa}
            busy={busy}
            url={url}
            tokenId={tokenId}
            secret={secret}
            removeCa={removeCa}
            onUrl={setUrl}
            onTokenId={setTokenId}
            onSecret={setSecret}
            onRemoveCa={setRemoveCa}
            onCaFile={caFile}
            onSubmit={(event, test) => void submit(event, test)}
            onCancel={() => setEditing(false)}
          />
        ) : resources ? (
          <ProxmoxResources
            resources={resources}
            checkedAt={checkedAt}
            showAll={showAll}
            onToggleAll={() => setShowAll(!showAll)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {configured
              ? 'Os recursos não estão disponíveis no momento.'
              : 'Conecte um token de leitura para ver seus nós, máquinas virtuais e containers.'}
          </p>
        )}
        {message && (
          <Alert role="status">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      {!editing && (
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {configured ? 'Alterar integração' : 'Configurar Proxmox'}
          </Button>
          {configured && (
            <Button type="button" variant="ghost" onClick={() => void refresh(true)}>
              Atualizar
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
