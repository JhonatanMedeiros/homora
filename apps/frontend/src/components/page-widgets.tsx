import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { clockWidget, defaultClockConfig, type ClockConfig } from '@homora/widgets/clock';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Clock } from '@/components/top-bar';
import { CardWidgets } from '@/components/card-widgets';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import { widgetStats, type Connection } from '@/features/connections/connection-model';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import type { PageRow } from '@/hooks/use-pages';
import { listTimeZones } from '@/lib/clock';
import { t } from '@/i18n';

type PageWidget = {
  id: number;
  pageId: number;
  type: string;
  name: string;
  config: unknown;
  connectionId: number | null;
  position: number;
  version: number;
};
type Draft = {
  id: number | null;
  pageId: number;
  type: string;
  name: string;
  config: ClockConfig;
  connectionId: number | null;
};

export function PageWidgets({ pageId, pages }: { pageId: number; pages: PageRow[] }) {
  const [widgets, setWidgets] = useState<PageWidget[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [readings, setReadings] = useState<Record<number, CardWidgetState>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PageWidget | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const response = await fetch('/api/page-widgets');
    if (!response.ok) throw new Error();
    setWidgets((await response.json()) as PageWidget[]);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      // Initial load synchronizes this view with the server.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reload(),
      fetch('/api/connections').then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([, rows]) => {
        if (active) setConnections(rows as Connection[]);
      })
      .catch(() => {
        if (active) setError(t('pageWidgets.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    const cycle = async () => {
      const connected = widgets.filter(
        (widget) => widget.connectionId !== null && widget.version === 1,
      );
      const results = new Map<number, unknown>();
      await Promise.all(
        [...new Set(connected.map((widget) => widget.connectionId!))].map(async (id) => {
          try {
            const response = await fetch(`/api/connections/${id}/data`, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error();
            results.set(id, ((await response.json()) as { data: unknown }).data);
          } catch {
            results.set(id, null);
          }
        }),
      );
      if (controller.signal.aborted) return;
      const next: Record<number, CardWidgetState> = {};
      for (const item of connected) {
        const widget = {
          id: item.id,
          integrationId: item.connectionId!,
          type: item.type,
          name:
            item.name ||
            connections.find((connection) => connection.id === item.connectionId)?.name ||
            item.type,
          serviceId: null,
        };
        const data = results.get(item.connectionId!);
        let stats: ReturnType<typeof widgetStats> = null;
        try {
          if (data) stats = widgetStats(item.type, data);
        } catch {
          /* Isolate a broken presentation. */
        }
        next[item.id] = !data
          ? { widget, status: 'error' }
          : stats
            ? { widget, status: 'ready', stats }
            : { widget, status: 'invalid' };
      }
      setReadings(next);
      timer = window.setTimeout(() => void cycle(), 60_000);
    };
    void cycle();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [widgets, connections]);
  const current = widgets.filter((item) => item.pageId === pageId);
  async function change(url: string, method: string, body?: unknown) {
    if (busy) return false;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error();
      await reload();
      setError('');
      return true;
    } catch {
      setError(t('pageWidgets.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const setConfig = (patch: Partial<ClockConfig>) =>
    setDraft((value) => value && { ...value, config: { ...value.config, ...patch } });
  if (!pageId) return null;
  return (
    <section aria-label={t('pageWidgets.title')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('pageWidgets.title')}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setDraft({
              id: null,
              pageId,
              type: 'clock',
              name: '',
              config: defaultClockConfig,
              connectionId: null,
            })
          }
        >
          {t('pageWidgets.add')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('common.loading')}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {current.map((item, index) => {
          const displayName =
            item.name ||
            (item.type === 'clock'
              ? t('pageWidgets.clock')
              : (connections.find((connection) => connection.id === item.connectionId)?.name ??
                item.type));
          const config =
            item.type === 'clock' && item.version === 1
              ? clockWidget.parseConfig(item.config)
              : null;
          const state = (item.version !== 1
            ? {
                widget: {
                  id: item.id,
                  integrationId: item.connectionId ?? 0,
                  type: item.type,
                  name: displayName,
                  serviceId: null,
                },
                status: 'invalid' as const,
              }
            : readings[item.id]) ?? {
            widget: {
              id: item.id,
              integrationId: item.connectionId ?? 0,
              type: item.type,
              name: displayName,
              serviceId: null,
            },
            status: 'loading' as const,
          };
          return (
            <article
              key={item.id}
              className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-medium">{displayName}</h3>
              </div>
              <WidgetErrorBoundary key={`${item.type}:${item.id}`}>
                {item.type === 'clock' ? (
                  config ? (
                    <Clock preferences={config} />
                  ) : (
                    <p>{t('cardWidget.invalid')}</p>
                  )
                ) : (
                  <CardWidgets widgets={[state]} />
                )}
              </WidgetErrorBoundary>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('common.edit')}: ${displayName}`}
                  disabled={item.version !== 1}
                  onClick={() =>
                    setDraft({
                      id: item.id,
                      pageId: item.pageId,
                      type: item.type,
                      name: item.name,
                      connectionId: item.connectionId,
                      config: config ?? defaultClockConfig,
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('pageWidgets.up')}: ${displayName}`}
                  disabled={index === 0}
                  onClick={() => {
                    const ids = current.map((entry) => entry.id);
                    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
                    void change('/api/page-widgets/order', 'PUT', { pageId, ids });
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('pageWidgets.down')}: ${displayName}`}
                  disabled={index === current.length - 1}
                  onClick={() => {
                    const ids = current.map((entry) => entry.id);
                    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
                    void change('/api/page-widgets/order', 'PUT', { pageId, ids });
                  }}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('pageWidgets.remove')}: ${displayName}`}
                  onClick={() => setRemoving(item)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pageWidgets.removeConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{removing?.name || removing?.type}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) void change(`/api/page-widgets/${removing.id}`, 'DELETE');
                setRemoving(null);
              }}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResponsiveDialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        title={draft?.id ? t('pageWidgets.edit') : t('pageWidgets.add')}
      >
        {draft && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const { id, ...body } = draft;
              void change(
                id ? `/api/page-widgets/${id}` : '/api/page-widgets',
                id ? 'PUT' : 'POST',
                { ...body, config: body.type === 'clock' ? body.config : {} },
              ).then((ok) => {
                if (ok) setDraft(null);
              });
            }}
          >
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pw-name">{t('pageWidgets.name')}</FieldLabel>
                <Input
                  id="pw-name"
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pw-type">{t('pageWidgets.kind')}</FieldLabel>
                <FormSelect
                  id="pw-type"
                  value={draft.connectionId === null ? 'clock' : String(draft.connectionId)}
                  onChange={(event) => {
                    const connection = connections.find(
                      (item) => item.id === Number(event.target.value),
                    );
                    setDraft({
                      ...draft,
                      type: connection?.type ?? 'clock',
                      connectionId: connection?.id ?? null,
                    });
                  }}
                >
                  <FormSelectOption value="clock">{t('pageWidgets.clock')}</FormSelectOption>
                  {connections.map((connection) => (
                    <FormSelectOption key={connection.id} value={String(connection.id)}>
                      {connection.name}
                    </FormSelectOption>
                  ))}
                </FormSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="pw-page">{t('pageWidgets.page')}</FieldLabel>
                <FormSelect
                  id="pw-page"
                  value={String(draft.pageId)}
                  onChange={(event) => setDraft({ ...draft, pageId: Number(event.target.value) })}
                >
                  {pages.map((page) => (
                    <FormSelectOption key={page.id} value={String(page.id)}>
                      {page.name}
                    </FormSelectOption>
                  ))}
                </FormSelect>
              </Field>
              {draft.type === 'clock' && (
                <>
                  <Field>
                    <FieldLabel htmlFor="pw-zone">{t('settings.ui.timeZone')}</FieldLabel>
                    <FormSelect
                      id="pw-zone"
                      value={draft.config.timeZone}
                      onChange={(event) => setConfig({ timeZone: event.target.value })}
                    >
                      <FormSelectOption value="">
                        {t('settings.ui.timeZoneBrowser', {
                          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        })}
                      </FormSelectOption>
                      {listTimeZones().map((zone) => (
                        <FormSelectOption key={zone} value={zone}>
                          {zone}
                        </FormSelectOption>
                      ))}
                    </FormSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pw-hours">{t('settings.ui.hours')}</FieldLabel>
                    <FormSelect
                      id="pw-hours"
                      value={draft.config.hourFormat}
                      onChange={(event) =>
                        setConfig({ hourFormat: event.target.value as ClockConfig['hourFormat'] })
                      }
                    >
                      <FormSelectOption value="auto">{t('settings.ui.hoursAuto')}</FormSelectOption>
                      <FormSelectOption value="12h">{t('settings.ui.hours12')}</FormSelectOption>
                      <FormSelectOption value="24h">{t('settings.ui.hours24')}</FormSelectOption>
                    </FormSelect>
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="pw-date"
                      checked={draft.config.date}
                      onCheckedChange={(date) => setConfig({ date })}
                    />
                    <FieldLabel htmlFor="pw-date">{t('settings.ui.date')}</FieldLabel>
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="pw-seconds"
                      checked={draft.config.seconds}
                      onCheckedChange={(seconds) => setConfig({ seconds })}
                    />
                    <FieldLabel htmlFor="pw-seconds">{t('settings.ui.seconds')}</FieldLabel>
                  </Field>
                </>
              )}
            </FieldGroup>
            <Button type="submit" disabled={busy}>
              {t('widgets.save')}
            </Button>
          </form>
        )}
      </ResponsiveDialog>
    </section>
  );
}
