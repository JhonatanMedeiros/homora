import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { SectionTitle } from '@/components/section-title';
import { ConnectionForm } from './connection-form';
import { ConnectionList } from './connection-list';
import {
  emptyForm,
  request,
  type Connection,
  type ConnectionFormState,
  type IntegrationWidget,
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
  const [confirming, setConfirming] = useState<string | null>(null);
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
      entityId: item.entityId ?? '',
      username: item.username ?? '',
      slug: item.slug ?? '',
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
    if (confirming !== `widget:${widget.id}`) {
      setConfirming(`widget:${widget.id}`);
      return;
    }
    setConfirming(null);
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
        ...(form.type === 'home-assistant' ? { entityId: form.entityId } : {}),
        ...(form.type === 'adguard-home' ? { username: form.username } : {}),
        ...(form.type === 'proxmox' && form.tokenId ? { tokenId: form.tokenId } : {}),
        ...(form.type === 'uptime-kuma' ? { slug: form.slug } : {}),
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
    if (operation === 'delete') {
      if (confirming !== `connection:${item.id}`) {
        setConfirming(`connection:${item.id}`);
        return;
      }
      setConfirming(null);
    }
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
  return (
    <section aria-labelledby="connections-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionTitle id="connections-title" count={items?.length}>
          {t('connections.title')}
        </SectionTitle>
        <p className="text-sm text-muted-foreground">{t('connections.description')}</p>
      </div>
      {(Boolean(items?.length) || widgets.length > 0) && (
        <WidgetsSection
          items={items}
          widgets={widgets}
          busy={busy}
          confirming={confirming}
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
          onRemove={(widget) => void removeWidget(widget)}
          onCancelRemoval={(widget) =>
            setConfirming((key) => (key === `widget:${widget.id}` ? null : key))
          }
        />
      )}
      {form ? (
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
            setMessage('');
          }}
        />
      ) : (
        <>
          {items === null && loadFailed ? (
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
            <p className="flex items-center gap-2 text-muted-foreground">
              <Spinner />
              {t('connections.loading')}
            </p>
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
              confirming={confirming}
              result={result}
              onEdit={edit}
              onAction={(item, operation) => void action(item, operation)}
              onCancelRemoval={(item) =>
                setConfirming((key) => (key === `connection:${item.id}` ? null : key))
              }
            />
          )}
          <Button
            type="button"
            className="w-fit"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setMessage('');
            }}
          >
            <Plus data-icon="inline-start" />
            {t('connections.add')}
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {message}
        </p>
      )}
    </section>
  );
}
