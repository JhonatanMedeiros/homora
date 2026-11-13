import { toast } from 'sonner';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  emptyForm,
  extraFields,
  request,
  type Connection,
  type ConnectionFormState,
  type IntegrationWidget,
  type Kind,
} from '@/features/connections/connection-model';
import { t } from '@/i18n';

export function useConnectionsPage(initialDraft?: ConnectionFormState | null) {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [widgets, setWidgets] = useState<IntegrationWidget[]>([]);
  const [widgetName, setWidgetName] = useState('');
  const [widgetConnection, setWidgetConnection] = useState('');
  const [widgetCard, setWidgetCard] = useState('');
  const [editingWidget, setEditingWidget] = useState<number | null>(null);
  const [widgetEditName, setWidgetEditName] = useState('');
  const [widgetEditCard, setWidgetEditCard] = useState('');
  const [cards, setCards] = useState<{ id: number; name: string }[]>([]);
  const [widgetResult, setWidgetResult] = useState<{ id: number; data: unknown } | null>(null);
  const [form, setForm] = useState<ConnectionFormState | null>(initialDraft ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'connections' | 'widgets'>('connections');
  const [picking, setPicking] = useState(false);
  const [resourcesOf, setResourcesOf] = useState<Connection | null>(null);
  const [removing, setRemoving] = useState<
    { kind: 'connection'; item: Connection } | { kind: 'widget'; item: IntegrationWidget } | null
  >(null);
  const [result, setResult] = useState<{ id: number; data: unknown; checkedAt?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [saveTesting, setSaveTesting] = useState(false);
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
      toast.success(t('widgets.created'));
    } catch (error) {
      const failure = error instanceof Error ? error.message : t('widgets.createFailed');
      setMessage(failure);
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  }
  async function updateWidget(widget: IntegrationWidget, name: string, serviceId: string) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/widgets/${widget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          serviceId: serviceId ? Number(serviceId) : null,
        }),
      });
      setEditingWidget(null);
      await load();
      toast.success(t('widgets.updated'));
    } catch (error) {
      const failure = error instanceof Error ? error.message : t('widgets.updateFailed');
      setMessage(failure);
      toast.error(failure);
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
      toast.success(t('widgets.removed'));
    } catch (error) {
      const failure = error instanceof Error ? error.message : t('widgets.removeFailed');
      setMessage(failure);
      toast.error(failure);
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
      const failure = error instanceof Error ? error.message : t('widgets.queryFailed');
      setMessage(failure);
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  }
  async function save(event?: FormEvent, testAfterSave = false) {
    event?.preventDefault();
    if (!form) return;
    setBusy(true);
    setSaveTesting(testAfterSave);
    setMessage('');
    const optional = new Set(
      extraFields(form.type)
        .filter(({ required }) => !required)
        .map(({ key }) => key),
    );
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
            // Saved optional fields are sent even when empty, so they can be cleared.
            .filter(([key, value]) => value !== '' || (editing !== null && optional.has(key))),
        ),
      };
      const saved = (await request(
        editing === null ? '/api/connections' : `/api/connections/${editing}`,
        {
          method: editing === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )) as Connection;
      if (testAfterSave) {
        await request(`/api/connections/${saved.id}/test`, { method: 'POST' });
        toast.success(t('connections.testOk', { name: saved.name }));
      }
      setForm(null);
      setEditing(null);
      setResult(null);
      await load();
      if (!testAfterSave) {
        toast.success(t('connections.saved'));
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : t('connections.saveFailed');
      setMessage(failure);
      toast.error(failure);
    } finally {
      setBusy(false);
      setSaveTesting(false);
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
        toast.success(t('connections.removed'));
      } else if (operation === 'test') {
        await request(`/api/connections/${item.id}/test`, { method: 'POST' });
        toast.success(t('connections.testOk', { name: item.name }));
      } else {
        const response = (await request(`/api/connections/${item.id}/data?refresh=true`)) as {
          data: unknown;
          checkedAt?: string;
        };
        setResult({ id: item.id, ...response });
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : t('connections.operationFailed');
      setMessage(failure);
      toast.error(failure);
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
  return {
    items,
    loadFailed,
    setLoadFailed,
    widgets,
    widgetName,
    setWidgetName,
    widgetConnection,
    setWidgetConnection,
    widgetCard,
    setWidgetCard,
    editingWidget,
    setEditingWidget,
    widgetEditName,
    setWidgetEditName,
    widgetEditCard,
    setWidgetEditCard,
    cards,
    widgetResult,
    form,
    setForm,
    editing,
    editingItem,
    setEditing,
    message,
    setMessage,
    tab,
    setTab,
    picking,
    setPicking,
    resourcesOf,
    setResourcesOf,
    removing,
    setRemoving,
    result,
    busy,
    saveTesting,
    selectedConnection,
    counts,
    browsing,
    load,
    edit,
    createWidget,
    updateWidget,
    removeWidget,
    queryWidget,
    save,
    action,
  };
}
