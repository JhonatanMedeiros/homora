import { useEffect, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { SectionTitle } from '@/components/section-title';
import { ProxmoxForm } from './proxmox-form';
import { ProxmoxResources, type Resource } from './proxmox-resources';
import { apiError, t } from '@/i18n';

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
          typeof body?.error === 'string' ? apiError(body.error) : t('proxmox.queryFailed'),
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
          ? apiError(error.message)
          : t('proxmox.serverUnreachable'),
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
      .catch(() => setMessage(t('proxmox.loadFailed')));
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
      if (!response.ok) throw Error(body.error || t('proxmox.saveFailed'));
      if (test) {
        setMessage(t('proxmox.testOk'));
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
          ? apiError(error.message)
          : t('proxmox.serverUnreachable'),
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
      setMessage(t('proxmox.caTooLarge'));
      input.value = '';
      return;
    }
    void file
      .text()
      .then((content) => {
        setCa(content);
        setRemoveCa(false);
      })
      .catch(() => setMessage(t('proxmox.caReadFailed')));
  };
  return (
    <Card>
      <CardHeader>
        <SectionTitle>Proxmox</SectionTitle>
        <CardDescription>
          {configured ? t('proxmox.readOnly') : t('proxmox.notConfigured')}
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
            {configured ? t('proxmox.unavailable') : t('proxmox.connectHint')}
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
            {configured ? t('proxmox.change') : t('proxmox.configure')}
          </Button>
          {configured && (
            <Button type="button" variant="ghost" onClick={() => void refresh(true)}>
              {t('proxmox.refresh')}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
