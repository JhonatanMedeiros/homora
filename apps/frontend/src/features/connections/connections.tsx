import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionForm } from './connection-form';
import { ConnectionList } from './connection-list';
import { ConnectionPicker } from './connection-picker';
import {
  emptyForm,
  newForm,
  extraFields,
  request,
  type Connection,
  type ConnectionFormState,
  type IntegrationWidget,
  type Kind,
} from './connection-model';
import { WidgetsSection } from './widgets-section';
import { t } from '@/i18n';

export function Connections({ initialDraft }: { initialDraft?: ConnectionFormState | null } = {}) {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [widgets, setWidgets] = useState<IntegrationWidget[]>([]);
  const [widgetName, setWidgetName] = useState('');
  const [widgetConnection, setWidgetConnection] = useState('');
  const [widgetCard, setWidgetCard] = useState('');
  const [cards, setCards] = useState<{ id: number; name: string }[]>([]);
  const [widgetResult, setWidgetResult] = useState<{ id: number; data: unknown } | null>(null);
  const [form, setForm] = useState<ConnectionFormState | null>(initialDraft ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'connections' | 'widgets'>('connections');
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<
    { kind: 'connection'; item: Connection } | { kind: 'widget'; item: IntegrationWidget } | null
  >(null);
  const [result, setResult] = useState<{ id: number; data: unknown; checkedAt?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [data, widgetData] = await Promise.all([
      request('/api/connections'),
      request('/api/widgets'),
    ]);
    if (!Array.isArray(data) || !Array.isArray(widgetData))
      throw new Error(t('connections.invalidResponse'));
    setItems(data as Connection[]);
    setWidgets(widgetData as IntegrationWidget[]);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request('/api/connections', { signal: controller.signal }),
      request('/api/widgets', { signal: controller.signal }),
    ])
      .then(([data, widgetData]) => {
        if (!Array.isArray(data) || !Array.isArray(widgetData))
          throw new Error(t('connections.invalidResponse'));
        if (!controller.signal.aborted) {
          setItems(data as Connection[]);
          setWidgets(widgetData as IntegrationWidget[]);
          if (data.length) setWidgetConnection(String((data[0] as Connection).id));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadFailed(true);
          setMessage(t('connections.loadFailed'));
        }
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    request('/api/services', { signal: controller.signal })
      .then((list) => {
        if (Array.isArray(list) && !controller.signal.aborted)
          setCards((list as { id: number; name: string }[]).map(({ id, name }) => ({ id, name })));
      })
      .catch(() => {
        // Without the card list, the widget simply cannot be linked to a card from here.
      });
    return () => controller.abort();
  }, []);
  function edit(item: Connection) {
    setEditing(item.id);
    setForm({
      ...emptyForm,
      type: item.type,
      name: item.name,
      url: item.url,
      allowPrivate: item.allowPrivate,
      values: Object.fromEntries(
        extraFields(item.type)
          .filter(({ kind }) => kind === 'text')
          .map(({ key }) => [key, typeof item[key] === 'string' ? item[key] : '']),
      ),
    });
    setMessage('');
  }
  const selectedConnection = widgetConnection || (items?.length ? String(items[0].id) : '');
  async function createWidget(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await request('/api/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: Number(selectedConnection),
          name: widgetName,
          ...(widgetCard ? { serviceId: Number(widgetCard) } : {}),
        }),
      });
      setWidgetName('');
      await load();
      setMessage(t('widgets.created'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('widgets.createFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function moveWidget(widget: IntegrationWidget, value: string) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/widgets/${widget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: value ? Number(value) : null }),
      });
      await load();
      setMessage(t('widgets.cardUpdated'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('widgets.cardFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function removeWidget(widget: IntegrationWidget) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/widgets/${widget.id}`, { method: 'DELETE' });
      setWidgets((current) => current.filter((item) => item.id !== widget.id));
      if (widgetResult?.id === widget.id) setWidgetResult(null);
      setMessage(t('widgets.removed'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('widgets.removeFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function queryWidget(widget: IntegrationWidget) {
    setBusy(true);
    setMessage('');
    try {
      const response = (await request(`/api/connections/${widget.integrationId}/data`)) as {
        data: unknown;
      };
      setWidgetResult({ id: widget.id, data: response.data });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('widgets.queryFailed'));
    } finally {
      setBusy(false);
    }
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
        // Only the fields this integration declares; empty optional values are not sent.
        ...Object.fromEntries(
          extraFields(form.type)
            .map(({ key }) => [key, form.values[key] ?? ''] as const)
            .filter(([, value]) => value !== ''),
        ),
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
      setMessage(t('connections.saved'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('connections.saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function action(item: Connection, operation: 'test' | 'data' | 'delete') {
    setBusy(true);
    setMessage('');
    setResult(null);
    try {
      if (operation === 'delete') {
        await request(`/api/connections/${item.id}`, { method: 'DELETE' });
        await load();
        setMessage(t('connections.removed'));
      } else if (operation === 'test') {
        await request(`/api/connections/${item.id}/test`, { method: 'POST' });
        setMessage(t('connections.testOk', { name: item.name }));
      } else {
        const response = (await request(`/api/connections/${item.id}/data?refresh=true`)) as {
          data: unknown;
          checkedAt?: string;
        };
        setResult({ id: item.id, ...response });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('connections.operationFailed'));
    } finally {
      setBusy(false);
    }
  }
  const editingItem = editing === null ? undefined : items?.find((item) => item.id === editing);
  const counts = (items ?? []).reduce<Partial<Record<Kind, number>>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});
  const browsing = !form && !picking;
  return (
    <section aria-label={t('connections.title')} className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        {(tab === 'widgets' || browsing) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList variant="line">
              <TabsTrigger value="connections">
                {t('connections.tab')}
                {items && <span className="font-mono text-xs opacity-70">{items.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="widgets">
                {t('widgets.tab')}
                <span className="font-mono text-xs opacity-70">{widgets.length}</span>
              </TabsTrigger>
            </TabsList>
            {tab === 'connections' && items !== null && (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setMessage('');
                  setPicking(true);
                }}
              >
                <Plus data-icon="inline-start" />
                {t('connections.add')}
              </Button>
            )}
          </div>
        )}
        <TabsContent value="connections" className="flex flex-col gap-4">
          {picking ? (
            <ConnectionPicker
              counts={counts}
              onPick={(type) => {
                setPicking(false);
                setForm(newForm(type));
              }}
              onCancel={() => setPicking(false)}
            />
          ) : form ? (
            <ConnectionForm
              form={form}
              editing={editing !== null}
              hasCa={Boolean(editingItem?.hasCa)}
              busy={busy}
              onChange={setForm}
              onUpdate={(update) => setForm((current) => (current ? update(current) : current))}
              onCaError={setMessage}
              onSubmit={(event) => void save(event)}
              onCancel={() => {
                setForm(null);
                setEditing(null);
                setMessage('');
              }}
            />
          ) : items === null && loadFailed ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setLoadFailed(false);
                setMessage('');
                void load().catch(() => {
                  setLoadFailed(true);
                  setMessage(t('connections.loadFailed'));
                });
              }}
            >
              <RotateCw data-icon="inline-start" />
              {t('connections.retryLoad')}
            </Button>
          ) : items === null ? (
            <RowListSkeleton label={t('connections.loading')} />
          ) : items.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle className="font-label text-lg">{t('connections.empty')}</EmptyTitle>
                <EmptyDescription>{t('connections.emptyHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ConnectionList
              items={items}
              busy={busy}
              result={result}
              onEdit={edit}
              onAction={(item, operation) => void action(item, operation)}
              onRemove={(item) => setRemoving({ kind: 'connection', item })}
            />
          )}
        </TabsContent>
        <TabsContent value="widgets">
          <WidgetsSection
            items={items}
            widgets={widgets}
            busy={busy}
            widgetName={widgetName}
            widgetConnection={selectedConnection}
            cards={cards}
            widgetCard={widgetCard}
            onCardChange={setWidgetCard}
            onMoveWidget={(widget, value) => void moveWidget(widget, value)}
            widgetResult={widgetResult}
            onNameChange={setWidgetName}
            onConnectionChange={setWidgetConnection}
            onCreate={(event) => void createWidget(event)}
            onQuery={(widget) => void queryWidget(widget)}
            onRemove={(widget) => setRemoving({ kind: 'widget', item: widget })}
          />
        </TabsContent>
      </Tabs>
      {message && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {message}
        </p>
      )}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.kind === 'widget'
                ? t('widgets.removeTitle', { name: removing.item.name })
                : t('connections.removeTitle', { name: removing?.item.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.kind === 'widget' ? t('widgets.removeBody') : t('connections.removeBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target?.kind === 'widget') void removeWidget(target.item);
                else if (target) void action(target.item, 'delete');
              }}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
