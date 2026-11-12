import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useState } from 'react';
import { Check, EllipsisVertical, Plus, RefreshCw, Server } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/copy-button';
import { apiError, formatDateTime, t } from '@/i18n';
import { ImportPreview } from '@/features/transfer/import-preview';
import type { Plan } from '@/features/transfer/transfer-model';
import { PrivateOption, SuggestionList } from './suggestion-list';

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
type Change = 'revoke' | 'remove' | 'rotate';

const MAX_SOURCES = 10;
const confirmText = {
  revoke: ['push.confirmRevoke', 'push.revokeBody'],
  rotate: ['push.confirmRotate', 'push.rotateBody'],
  remove: ['push.confirmRemove', 'push.removeBody'],
} as const;

/** Where a source stands, in words (the badge never relies on color alone). */
function sourceStatus(source: Source) {
  if (source.revoked) return { label: t('push.status.revoked'), variant: 'secondary' } as const;
  if (!source.receivedAt) return { label: t('push.status.waiting'), variant: 'outline' } as const;
  if (source.stale) return { label: t('push.status.stale'), variant: 'destructive' } as const;
  return { label: t('push.status.online'), variant: 'success' } as const;
}

/** The agent's run command, with this page's origin filled in for the reader to adjust. */
const agentCommand = (
  origin: string,
) => `docker run -d --name homora-discovery-agent --restart unless-stopped \\
  --user "$(id -u):$(id -g)" --group-add "$(stat -c '%g' /var/run/docker.sock)" \\
  -e HOMORA_AGENT_ORIGIN=${origin} \\
  -e HOMORA_AGENT_TOKEN_FILE=/run/secrets/homora-token \\
  -v /path/to/protected-token:/run/secrets/homora-token:ro \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  homora-discovery-agent:local`;

/** Remote Docker agents: one source per host, each with a token and its own inventory. */
export function PushSources({ onImported }: { onImported: () => void | Promise<void> }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ source: Source; action: Change } | null>(null);
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
  async function change(source: Source, actionName: Change) {
    await action(async () => {
      if (actionName === 'rotate') {
        const data = await call(`/api/discovery/sources/${source.id}/rotate`, 'POST');
        setToken({ name: source.name, value: data.token });
      } else if (actionName === 'revoke')
        await call(`/api/discovery/sources/${source.id}/revoke`, 'POST');
      else await call(`/api/discovery/sources/${source.id}`, 'DELETE');
      setConfirm(null);
      setPreview(null);
      await load();
    });
  }
  const previewName = preview
    ? sources.find((source) => source.id === preview.source.id)?.name
    : '';
  const items = preview
    ? preview.plan.services.map((service, index) => {
        const entry = preview.entries[index];
        return {
          id: entry?.id,
          name: service.name,
          group: service.group,
          url: service.url,
          container: entry?.container,
          isNew: service.status === 'new',
        };
      })
    : [];
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t('push.hint')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm text-muted-foreground tabular-nums">
          {t('push.sourcesCount', { count: sources.length })}
          {sources.length >= MAX_SOURCES && ` · ${t('push.limit')}`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void action(load)}
          >
            <RefreshCw data-icon="inline-start" />
            {t('push.refresh')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || sources.length >= MAX_SOURCES}
            onClick={() => setAdding(true)}
          >
            <Plus data-icon="inline-start" />
            {t('push.add')}
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {sources.length === 0 ? (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Server aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t('push.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('push.emptyHint')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <p className="sr-only">{t('push.empty')}</p>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
          {sources.map((source) => {
            const status = sourceStatus(source);
            return (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="break-words">{source.name}</strong>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
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
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('push.actions', { name: source.name })}
                      >
                        <EllipsisVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={busy || Boolean(source.revoked)}
                        onSelect={() => setConfirm({ source, action: 'rotate' })}
                      >
                        {t('push.rotate')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy || Boolean(source.revoked)}
                        onSelect={() => setConfirm({ source, action: 'revoke' })}
                      >
                        {t('push.revoke')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={busy}
                        onSelect={() => setConfirm({ source, action: 'remove' })}
                      >
                        {t('push.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Collapsible className="rounded-lg border bg-card">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm font-medium">
          {t('push.setup')}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-muted-foreground">{t('push.setupHint')}</p>
          <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs">
            {agentCommand(window.location.origin)}
          </pre>
          <div>
            <CopyButton
              size="sm"
              text={agentCommand(window.location.origin)}
              label={t('settings.copy')}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setName('');
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const data = await call('/api/discovery/sources', 'POST', { name });
                setToken({ name, value: data.token });
                setName('');
                setAdding(false);
                await load();
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('push.addTitle')}</DialogTitle>
              <DialogDescription>{t('push.addHint')}</DialogDescription>
            </DialogHeader>
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t('push.cancel')}
              </Button>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy && <Spinner data-icon="inline-start" />}
                {t('push.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={token !== null} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('push.tokenTitle', { name: token?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('push.token')}</DialogDescription>
          </DialogHeader>
          <code className="rounded-md border bg-background p-3 font-mono text-sm break-all select-all">
            {token?.value}
          </code>
          <DialogFooter>
            <CopyButton
              text={token?.value ?? ''}
              label={t('push.tokenCopy')}
              doneLabel={t('push.tokenCopied')}
            />
            <Button type="button" onClick={() => setToken(null)}>
              <Check data-icon="inline-start" />
              {t('push.dismiss')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('push.reviewTitle', { name: previewName ?? '' })}</DialogTitle>
            <DialogDescription>{t('push.reviewHint')}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-4">
              {items.length === 0 && <p className="text-sm">{t('discovery.none')}</p>}
              {preview.plan.issues.length > 0 && (
                <ImportPreview plan={{ ...preview.plan, services: [] }} />
              )}
              {items.length > 0 && (
                <SuggestionList
                  idPrefix="push"
                  label={t('discovery.list')}
                  items={items}
                  selected={selected}
                  onChange={setSelected}
                />
              )}
              {items.some((item) => item.isNew) && (
                <PrivateOption
                  id="push-private"
                  checked={allowPrivate}
                  onChange={setAllowPrivate}
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
              {t('push.cancel')}
            </Button>
            <Button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => {
                if (!preview) return;
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
                });
              }}
            >
              {t('discovery.add')} ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm && t(confirmText[confirm.action][0])} · {confirm?.source.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && t(confirmText[confirm.action][1])}
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
              {confirm && t(confirmText[confirm.action][0])}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
