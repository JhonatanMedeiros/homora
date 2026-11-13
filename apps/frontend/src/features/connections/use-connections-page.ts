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

export type WidgetFormState = { id: number | null; name: string; connection: string; card: string };

const snapshot = (form: ConnectionFormState | null) => (form ? JSON.stringify(form) : '');

export function useConnectionsPage(initialDraft?: ConnectionFormState | null) {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [widgets, setWidgets] = useState<IntegrationWidget[]>([]);
  const [widgetForm, setWidgetForm] = useState<WidgetFormState | null>(null);
  const [cards, setCards] = useState<{ id: number; name: string }[]>([]);
  const [widgetResult, setWidgetResult] = useState<{ id: number; data: unknown } | null>(null);
  const [form, setForm] = useState<ConnectionFormState | null>(initialDraft ?? null);
  const [formBase, setFormBase] = useState(snapshot(initialDraft ?? null));
  const [editing, setEditing] = useState<number | null>(null);
  const [focusSecret, setFocusSecret] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'connections' | 'widgets'>('connections');
  const [picking, setPicking] = useState(false);
  /** Connection whose details are open in the dialog. */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [resourcesOf, setResourcesOf] = useState<Connection | null>(null);
  const [removingWidget, setRemovingWidget] = useState<IntegrationWidget | null>(null);
  const [result, setResult] = useState<{ id: number; data: unknown; checkedAt?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [saveTesting, setSaveTesting] = useState(false);
  const [testing, setTesting] = useState(false);

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

  const openForm = (next: ConnectionFormState) => {
    setForm(next);
    setFormBase(snapshot(next));
    setDiscarding(false);
  };
  /** Opens the add flow at the type picker. */
  function startAdding() {
    setEditing(null);
    setMessage('');
    setSelectedId(null);
    setPicking(true);
  }
  function startForm(next: ConnectionFormState) {
    setPicking(false);
    openForm(next);
  }
  function edit(item: Connection, fromFailure = false) {
    setEditing(item.id);
    setFocusSecret(fromFailure);
    openForm({
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
  const dirty = form !== null && snapshot(form) !== formBase;
  function leaveForm() {
    setForm(null);
    setEditing(null);
    setDiscarding(false);
    setFocusSecret(false);
    setMessage('');
  }
  /** Cancel or close from the form: asks first when something was typed. */
  function cancelForm() {
    if (dirty) setDiscarding(true);
    else leaveForm();
  }
  /** Back to the details when editing, or closes when adding. */
  function closeDialog() {
    if (form) return cancelForm();
    setPicking(false);
    setSelectedId(null);
    setConfirmingRemoval(false);
  }
  function select(item: Connection | null) {
    setSelectedId(item?.id ?? null);
    setConfirmingRemoval(false);
    setMessage('');
  }

  const newWidget = () =>
    setWidgetForm({ id: null, name: '', connection: String(items?.[0]?.id ?? ''), card: '' });
  const editWidget = (widget: IntegrationWidget) =>
    setWidgetForm({
      id: widget.id,
      name: widget.name,
      connection: String(widget.integrationId),
      card: widget.serviceId ? String(widget.serviceId) : '',
    });
  async function saveWidget(event: FormEvent) {
    event.preventDefault();
    if (!widgetForm) return;
    const wasNew = widgetForm.id === null;
    setBusy(true);
    setMessage('');
    try {
      if (wasNew) {
        await request('/api/widgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationId: Number(widgetForm.connection),
            name: widgetForm.name,
            ...(widgetForm.card ? { serviceId: Number(widgetForm.card) } : {}),
          }),
        });
      } else {
        await request(`/api/widgets/${widgetForm.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: widgetForm.name.trim(),
            serviceId: widgetForm.card ? Number(widgetForm.card) : null,
          }),
        });
      }
      setWidgetForm(null);
      await load();
      toast.success(wasNew ? t('widgets.created') : t('widgets.updated'));
    } catch (error) {
      const failure =
        error instanceof Error
          ? error.message
          : wasNew
            ? t('widgets.createFailed')
            : t('widgets.updateFailed');
      toast.error(failure);
      setMessage(failure);
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
      let testFailed = false;
      if (testAfterSave) {
        try {
          await request(`/api/connections/${saved.id}/test`, { method: 'POST' });
          toast.success(t('connections.testOk', { name: saved.name }));
        } catch (error) {
          testFailed = true;
          toast.error(error instanceof Error ? error.message : t('connections.operationFailed'));
        }
      }
      leaveForm();
      setResult(null);
      await load();
      // The details show the saved connection and, when asked, how the test went.
      setSelectedId(saved.id);
      if (!testAfterSave) toast.success(t('connections.saved'));
      else if (testFailed) toast.message(t('connections.saved'));
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
    setTesting(operation === 'test');
    setMessage('');
    if (operation !== 'data') setResult(null);
    try {
      if (operation === 'delete') {
        await request(`/api/connections/${item.id}`, { method: 'DELETE' });
        setSelectedId(null);
        setConfirmingRemoval(false);
        await load();
        toast.success(t('connections.removed'));
      } else if (operation === 'test') {
        try {
          await request(`/api/connections/${item.id}/test`, { method: 'POST' });
          toast.success(t('connections.testOk', { name: item.name }));
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t('connections.operationFailed'));
        }
        // The result of the test, success or failure, is stored; the list shows it.
        await load();
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
      setTesting(false);
    }
  }
  const editingItem = editing === null ? undefined : items?.find((item) => item.id === editing);
  const selected = selectedId === null ? null : (items?.find((i) => i.id === selectedId) ?? null);
  const counts = (items ?? []).reduce<Partial<Record<Kind, number>>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});
  return {
    items,
    loadFailed,
    setLoadFailed,
    widgets,
    widgetForm,
    setWidgetForm,
    cards,
    widgetResult,
    form,
    setForm,
    editing,
    editingItem,
    focusSecret,
    message,
    setMessage,
    tab,
    setTab,
    picking,
    setPicking,
    selected,
    select,
    confirmingRemoval,
    setConfirmingRemoval,
    discarding,
    setDiscarding,
    resourcesOf,
    setResourcesOf,
    removingWidget,
    setRemovingWidget,
    result,
    busy,
    testing,
    saveTesting,
    counts,
    load,
    startAdding,
    startForm,
    edit,
    leaveForm,
    cancelForm,
    closeDialog,
    newWidget,
    editWidget,
    saveWidget,
    removeWidget,
    queryWidget,
    save,
    action,
  };
}
