import { useEffect, useState } from 'react';
import { Container, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { SectionSkeleton } from '@/components/skeletons';
import { apiError, t } from '@/i18n';
import { ImportPreview } from '@/features/transfer/import-preview';
import type { Plan } from '@/features/transfer/transfer-model';
import { PrivateOption, SuggestionList } from './suggestion-list';

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
 * Card suggestions from the labels of this host's Docker containers. Nothing is added without
 * review: the user selects containers and confirms, and the server re-queries Docker.
 */
export function LocalDiscovery({ onImported }: { onImported: () => void | Promise<void> }) {
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

  const items =
    state.status === 'ready'
      ? state.found.plan.services.map((service, index) => {
          const entry = state.found.entries[index];
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
  const newCount = items.filter((item) => item.isNew).length;

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'loading' && <SectionSkeleton label={t('discovery.loading')} />}
      {state.status === 'disabled' && (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Container aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t('discovery.localOffTitle')}</EmptyTitle>
            <EmptyDescription>{t('discovery.localOffHint')}</EmptyDescription>
          </EmptyHeader>
          <p className="max-w-[60ch] text-sm text-muted-foreground">{t('discovery.disabled')}</p>
        </Empty>
      )}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t('discovery.scanned', { count: state.found.scanned })}{' '}
              {newCount > 0 && (
                <span className="font-mono text-foreground">
                  · {t('discovery.newCount', { count: newCount })}
                </span>
              )}
            </p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rescan}>
              <RefreshCw data-icon="inline-start" />
              {t('discovery.rescan')}
            </Button>
          </div>
          {items.length === 0 ? (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyTitle>{t('discovery.none')}</EmptyTitle>
                <EmptyDescription>{t('discovery.labelsHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <SuggestionList
              idPrefix="discovery"
              label={t('discovery.list')}
              items={items}
              selected={selected}
              onChange={setSelected}
              disabled={busy}
            />
          )}
          {state.found.plan.issues.length > 0 && (
            <ImportPreview plan={{ ...state.found.plan, services: [] }} />
          )}
          {newCount > 0 && (
            <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
              <PrivateOption
                id="discovery-private"
                checked={allowPrivate}
                onChange={setAllowPrivate}
              />
              <div>
                <Button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => void add()}
                >
                  {selected.size > 0
                    ? `${t('discovery.add')} (${selected.size})`
                    : t('discovery.add')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {state.status === 'error' && (
        <div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={rescan}>
            <RefreshCw data-icon="inline-start" />
            {t('discovery.rescan')}
          </Button>
        </div>
      )}
      <div role="status" className="empty:hidden">
        {message && (
          <Alert>
            <AlertDescription className="text-foreground">{message}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
