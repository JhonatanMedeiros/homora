import { useEffect, useState } from 'react';
import { t } from '@/i18n';

type Channel = {
  id: number;
  name: string;
  type: 'webhook' | 'telegram' | 'ntfy' | 'discord';
  enabled: boolean;
  allowPrivate: boolean;
  includeUrl: boolean;
  lastSentAt: string | null;
  lastError: string | null;
  failures: number;
};
type Form = Pick<Channel, 'name' | 'type' | 'enabled' | 'allowPrivate' | 'includeUrl'> & {
  destination: string;
  token: string;
  chatId: string;
};
const blank = (): Form => ({
  name: '',
  type: 'webhook',
  enabled: true,
  allowPrivate: false,
  includeUrl: false,
  destination: '',
  token: '',
  chatId: '',
});

export function useNotificationSettings() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [openType, setOpenType] = useState<Channel['type'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  async function refresh() {
    const response = await fetch('/api/notifications/channels');
    if (!response.ok) throw new Error();
    setChannels((await response.json()) as Channel[]);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/notifications/channels', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Channel[]>;
      })
      .then(setChannels)
      .catch(() => {
        if (!controller.signal.aborted) setMessage({ error: true, text: t('notifications.error') });
      });
    return () => controller.abort();
  }, []);
  function edit(channel: Channel) {
    setEditing(channel.id);
    setOpenType(channel.type);
    setForm({
      ...blank(),
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      allowPrivate: channel.allowPrivate,
      includeUrl: channel.includeUrl,
    });
    setMessage(null);
  }
  function reset() {
    setEditing(null);
    setOpenType(null);
    setForm(blank());
  }
  function add(type: Channel['type']) {
    setEditing(null);
    setOpenType(type);
    setForm({ ...blank(), type });
    setMessage(null);
  }
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/notifications/channels${editing === null ? '' : `/${editing}`}`,
        {
          method: editing === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      if (!response.ok) throw new Error();
      await refresh();
      reset();
      setMessage({ error: false, text: t('notifications.saved') });
    } catch {
      setMessage({ error: true, text: t('notifications.error') });
    } finally {
      setBusy(false);
    }
  }
  async function action(channel: Channel, action: 'test' | 'delete') {
    if (action === 'delete' && !window.confirm(t('notifications.confirmDelete'))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/notifications/channels/${channel.id}${action === 'test' ? '/test' : ''}`,
        { method: action === 'test' ? 'POST' : 'DELETE' },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(
          /^HTTP \d{3}$/.test(body.error ?? '') ? body.error : t('notifications.error'),
        );
      }
      if (action === 'test') setMessage({ error: false, text: t('notifications.success') });
      if (editing === channel.id && action === 'delete') reset();
      await refresh();
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : t('notifications.error'),
      });
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return {
    channels,
    form,
    setForm,
    editing,
    openType,
    busy,
    message,
    setMessage,
    edit,
    reset,
    add,
    save,
    action,
  };
}
