import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SectionTitle } from '@/components/section-title';
import { apiError, formatDateTime, t } from '@/i18n';
import { ImportPreview } from '@/features/transfer/import-preview';
import type { Plan } from '@/features/transfer/transfer-model';

type Source = {
  id: string;
  name: string;
  revoked: number;
  receivedAt: number | null;
  stale: boolean;
};
type Preview = {
  source: { id: string; version: number };
  version: number;
  entries: { id: string; container: string }[];
  plan: Plan;
};

export function PushSources({ onImported }: { onImported: () => void | Promise<void> }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{
    source: Source;
    action: 'revoke' | 'remove' | 'rotate';
  } | null>(null);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/discovery/sources');
    if (!response.ok) throw new Error();
    const data = await response.json();
    setSources(Array.isArray(data.sources) ? data.sources : []);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/discovery/sources', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setSources(Array.isArray(data.sources) ? data.sources : []))
      .catch(() => {
        if (!controller.signal.aborted) setError(t('push.failed'));
      });
    return () => controller.abort();
  }, [load]);
  async function call(path: string, method: string, body?: object) {
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw new Error(apiError(data, t('push.failed')));
    }
    return response.status === 204 ? null : response.json();
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('push.failed'));
    } finally {
      setBusy(false);
    }
  }
  async function change(source: Source, actionName: 'revoke' | 'remove' | 'rotate') {
    await action(async () => {
      if (actionName === 'rotate') {
        const data = await call(`/api/discovery/sources/${source.id}/rotate`, 'POST');
        setToken(data.token);
      } else if (actionName === 'revoke')
        await call(`/api/discovery/sources/${source.id}/revoke`, 'POST');
      else await call(`/api/discovery/sources/${source.id}`, 'DELETE');
      setConfirm(null);
      setPreview(null);
      await load();
    });
  }
  return (
    <section aria-labelledby="push-title">
      <Card>
        <CardHeader>
          <SectionTitle id="push-title">{t('push.title')}</SectionTitle>
          <CardDescription>{t('push.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const data = await call('/api/discovery/sources', 'POST', { name });
                setToken(data.token);
                setName('');
                await load();
              });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="push-name">{t('push.name')}</FieldLabel>
                <Input
                  id="push-name"
                  value={name}
                  maxLength={80}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy && <Spinner data-icon="inline-start" />}
                {t('push.create')}
              </Button>
            </FieldGroup>
          </form>
          {token && (
            <Alert>
              <AlertDescription className="flex flex-col gap-2">
                <span>{t('push.token')}</span>
                <code className="break-all select-all">{token}</code>
                <Button type="button" variant="outline" onClick={() => setToken('')}>
                  {t('push.dismiss')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!sources.length && <p className="text-sm text-muted-foreground">{t('push.empty')}</p>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => void action(load)}>
            {t('push.refresh')}
          </Button>
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <ul className="flex flex-col gap-4">
            {sources.map((source) => (
              <li key={source.id} className="flex flex-col gap-2 rounded-md border p-3">
                <strong>{source.name}</strong>
                <p className="text-sm text-muted-foreground">
                  {source.revoked
                    ? t('push.revoked')
                    : source.receivedAt
                      ? t('push.last', { time: formatDateTime(source.receivedAt) })
                      : t('push.never')}
                </p>
                {!source.revoked && source.receivedAt && source.stale ? (
                  <p className="text-sm">{t('push.expired')}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || Boolean(source.revoked) || !source.receivedAt}
                    onClick={() =>
                      void action(async () => {
                        setPreview(
                          await call(`/api/discovery/sources/${source.id}/suggestions`, 'GET'),
                        );
                        setSelected(new Set());
                      })
                    }
                  >
                    {t('push.review')}
                  </Button>
                  {(['revoke', 'rotate', 'remove'] as const).map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant="outline"
                      disabled={busy || (item !== 'remove' && Boolean(source.revoked))}
                      onClick={() => setConfirm({ source, action: item })}
                    >
                      {t(
                        item === 'revoke'
                          ? 'push.revoke'
                          : item === 'rotate'
                            ? 'push.rotate'
                            : 'push.remove',
                      )}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {preview && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">
                {sources.find((source) => source.id === preview.source.id)?.name}
              </h3>
              {preview.plan.services.length === 0 && (
                <p className="text-sm">{t('discovery.none')}</p>
              )}
              {preview.plan.issues.length > 0 && (
                <ImportPreview plan={{ ...preview.plan, services: [] }} />
              )}
              <ul className="flex flex-col gap-2">
                {preview.plan.services.map((service, index) => {
                  const entry = preview.entries[index];
                  return (
                    <li key={entry?.id ?? service.url} className="flex items-start gap-2">
                      <Checkbox
                        id={`push-${entry.id}`}
                        disabled={service.status !== 'new'}
                        checked={selected.has(entry.id)}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(entry.id);
                            else next.delete(entry.id);
                            return next;
                          })
                        }
                      />
                      <label htmlFor={`push-${entry.id}`} className="flex flex-col">
                        <span>
                          {service.name} · {service.group}
                        </span>
                        <span className="text-sm break-all text-muted-foreground">
                          {service.url}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {t('discovery.container', { name: entry.container })} ·{' '}
                          {service.status === 'new'
                            ? t('transfer.statusNew')
                            : t('transfer.statusDuplicate')}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {preview.plan.services.some((service) => service.status === 'new') && (
                <Field orientation="horizontal" className="items-start">
                  <Checkbox
                    id="push-private"
                    checked={allowPrivate}
                    onCheckedChange={(checked) => setAllowPrivate(checked === true)}
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel htmlFor="push-private">{t('discovery.private')}</FieldLabel>
                    <FieldDescription>{t('discovery.privateHint')}</FieldDescription>
                  </div>
                </Field>
              )}
              <Button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() =>
                  void action(async () => {
                    const result = await call(
                      `/api/discovery/sources/${preview.source.id}/import`,
                      'POST',
                      {
                        ids: [...selected],
                        inventoryVersion: preview.source.version,
                        expectedVersion: preview.version,
                        ...(allowPrivate ? { keepPrivate: true } : {}),
                      },
                    );
                    setMessage(t('discovery.added', { count: result.created }));
                    setPreview(null);
                    setSelected(new Set());
                    await onImported();
                    await load();
                  })
                }
              >
                {t('discovery.add')} ({selected.size})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm &&
                t(
                  confirm.action === 'revoke'
                    ? 'push.confirmRevoke'
                    : confirm.action === 'rotate'
                      ? 'push.confirmRotate'
                      : 'push.confirmRemove',
                )}{' '}
              · {confirm?.source.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm &&
                t(
                  confirm.action === 'revoke'
                    ? 'push.revokeBody'
                    : confirm.action === 'rotate'
                      ? 'push.rotateBody'
                      : 'push.removeBody',
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('push.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm) void change(confirm.source, confirm.action);
              }}
            >
              {confirm &&
                t(
                  confirm.action === 'revoke'
                    ? 'push.confirmRevoke'
                    : confirm.action === 'rotate'
                      ? 'push.confirmRotate'
                      : 'push.confirmRemove',
                )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
