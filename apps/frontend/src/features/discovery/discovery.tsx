import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { SectionTitle } from '@/components/section-title';
import { apiError, t } from '@/i18n';
import { PushSources } from './push-sources';
import { ImportPreview } from '@/features/transfer/import-preview';
import type { Plan } from '@/features/transfer/transfer-model';

type Entry = { id: string; container: string; group: string; url: string };
type Found = {
  enabled: true;
  scanned: number;
  entries: Entry[];
  version: number;
  plan: Plan;
};
type State =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; found: Found };

/**
 * Card suggestions from Docker container labels. Nothing is added without review:
 * the user selects containers and confirms, and the server re-queries Docker.
 */
export function Discovery({ onImported }: { onImported: () => void | Promise<void> }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function scan() {
      try {
        const response = await fetch('/api/discovery', { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({ status: 'error', message: apiError(body, t('discovery.failed')) });
        } else if (
          !body ||
          typeof body !== 'object' ||
          (body as { enabled?: unknown }).enabled !== true
        ) {
          setState({ status: 'disabled' });
        } else {
          setState({ status: 'ready', found: body as Found });
          setSelected(new Set());
        }
      } catch {
        if (!controller.signal.aborted)
          setState({ status: 'error', message: t('discovery.failed') });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void scan();
    return () => controller.abort();
  }, [reload]);

  function rescan() {
    setBusy(true);
    setMessage('');
    setReload((value) => value + 1);
  }

  async function add() {
    if (state.status !== 'ready' || selected.size === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/discovery/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selected],
          keepPrivate: allowPrivate,
          expectedVersion: state.found.version,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(apiError(body, t('discovery.failed')));
        return;
      }
      const created = (body as { created?: number }).created ?? 0;
      await onImported();
      setMessage(t('discovery.added', { count: created }));
      setReload((value) => value + 1);
    } catch {
      setMessage(t('discovery.failed'));
    } finally {
      setBusy(false);
    }
  }

  const rows =
    state.status === 'ready'
      ? state.found.plan.services.map((service, index) => ({
          service,
          entry: state.found.entries[index],
        }))
      : [];

  return (
    <>
      <section aria-labelledby="discovery-title">
        <Card>
          <CardHeader>
            <SectionTitle id="discovery-title">{t('discovery.title')}</SectionTitle>
            <CardDescription>{t('discovery.hint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {state.status === 'loading' && (
              <p role="status" className="text-sm text-muted-foreground">
                {t('discovery.loading')}
              </p>
            )}
            {state.status === 'disabled' && (
              <p className="text-sm text-muted-foreground">{t('discovery.disabled')}</p>
            )}
            {state.status === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            {state.status === 'ready' && (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('discovery.scanned', { count: state.found.scanned })}
                </p>
                {rows.length === 0 ? (
                  <p className="text-sm">{t('discovery.none')}</p>
                ) : (
                  <ul
                    aria-label={t('discovery.list')}
                    className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-sm"
                  >
                    {rows.map(({ service, entry }) => {
                      const isNew = service.status === 'new' && Boolean(entry);
                      const id = `discovery-${entry?.id ?? service.url}`;
                      return (
                        <li key={id} className="flex items-start gap-3 px-1 py-1">
                          <Checkbox
                            id={id}
                            disabled={!isNew || busy}
                            checked={isNew && selected.has(entry.id)}
                            onCheckedChange={(checked) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (checked === true) next.add(entry.id);
                                else next.delete(entry.id);
                                return next;
                              })
                            }
                          />
                          <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="break-words">
                              <b className="font-semibold">{service.name}</b>{' '}
                              <span className="text-muted-foreground">· {service.group}</span>
                            </span>
                            <span className="font-mono text-xs break-all text-muted-foreground">
                              {service.url}
                            </span>
                            {entry && (
                              <small className="text-muted-foreground">
                                {t('discovery.container', { name: entry.container })}
                              </small>
                            )}
                          </label>
                          <Badge variant={isNew ? 'success' : 'secondary'}>
                            {isNew ? t('transfer.statusNew') : t('transfer.statusDuplicate')}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {state.found.plan.issues.length > 0 && (
                  <ImportPreview plan={{ ...state.found.plan, services: [] }} />
                )}
                {rows.some(({ service }) => service.status === 'new') && (
                  <Field orientation="horizontal" className="items-start">
                    <Checkbox
                      id="discovery-private"
                      checked={allowPrivate}
                      onCheckedChange={(checked) => setAllowPrivate(checked === true)}
                    />
                    <div className="flex flex-col gap-1">
                      <FieldLabel htmlFor="discovery-private">{t('discovery.private')}</FieldLabel>
                      <FieldDescription>{t('discovery.privateHint')}</FieldDescription>
                    </div>
                  </Field>
                )}
              </>
            )}
            <div role="status" className="empty:hidden">
              {message && (
                <Alert>
                  <AlertDescription className="text-foreground">{message}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
          {state.status !== 'disabled' && (
            <CardFooter className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={rescan}>
                <RefreshCw data-icon="inline-start" />
                {t('discovery.rescan')}
              </Button>
              {state.status === 'ready' && (
                <Button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => void add()}
                >
                  {selected.size > 0
                    ? `${t('discovery.add')} (${selected.size})`
                    : t('discovery.add')}
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      </section>
      <PushSources onImported={onImported} />
    </>
  );
}
