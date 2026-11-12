import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { t, formatDateTime } from '@/i18n';

type Channel = {
  id: number;
  name: string;
  type: 'webhook' | 'telegram';
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

export function NotificationSettings() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<number | null>(null);
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
    setForm(blank());
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
  return (
    <section aria-labelledby="notifications-title" className="flex flex-col gap-6">
      <div>
        <h2 id="notifications-title" className="text-xl">
          {t('notifications.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.hint')}</p>
      </div>
      {channels && (
        <div className="flex flex-col gap-3">
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : (
            channels.map((channel) => (
              <div key={channel.id} className="flex flex-col gap-3 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">{channel.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      channel.type === 'webhook'
                        ? 'notifications.webhook'
                        : 'notifications.telegram',
                    )}
                    {!channel.enabled && ` · ${t('notifications.disabled')}`}
                  </p>
                </div>
                {channel.lastSentAt && (
                  <p className="text-sm">
                    {t('notifications.lastSent', { date: formatDateTime(channel.lastSentAt) })}
                  </p>
                )}
                {channel.lastError && (
                  <p className="text-sm">
                    {t('notifications.failed', { error: channel.lastError })} ·{' '}
                    {t('notifications.failures', { count: channel.failures })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => edit(channel)}
                  >
                    {t('notifications.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void action(channel, 'test')}
                  >
                    {t('notifications.test')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void action(channel, 'delete')}
                  >
                    {t('notifications.delete')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="notification-name">{t('notifications.name')}</FieldLabel>
            <Input
              id="notification-name"
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="notification-type">{t('notifications.type')}</FieldLabel>
            <Select
              value={form.type}
              disabled={editing !== null}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  type: value === 'telegram' ? 'telegram' : 'webhook',
                })
              }
            >
              <SelectTrigger id="notification-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="webhook">{t('notifications.webhook')}</SelectItem>
                  <SelectItem value="telegram">{t('notifications.telegram')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {form.type === 'webhook' ? (
            <Field>
              <FieldLabel htmlFor="notification-destination">{t('notifications.url')}</FieldLabel>
              <Input
                id="notification-destination"
                type="password"
                autoComplete="off"
                required={editing === null}
                value={form.destination}
                onChange={(event) => setForm({ ...form, destination: event.target.value })}
              />
              {editing !== null && <FieldDescription>{t('notifications.keep')}</FieldDescription>}
            </Field>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="notification-token">{t('notifications.token')}</FieldLabel>
                <Input
                  id="notification-token"
                  type="password"
                  autoComplete="off"
                  required={editing === null}
                  value={form.token}
                  onChange={(event) => setForm({ ...form, token: event.target.value })}
                />
                {editing !== null && <FieldDescription>{t('notifications.keep')}</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor="notification-chat">{t('notifications.chat')}</FieldLabel>
                <Input
                  id="notification-chat"
                  type="password"
                  autoComplete="off"
                  required={editing === null}
                  value={form.chatId}
                  onChange={(event) => setForm({ ...form, chatId: event.target.value })}
                />
                {editing !== null && <FieldDescription>{t('notifications.keep')}</FieldDescription>}
              </Field>
            </>
          )}
          {(
            [
              'enabled',
              ...(form.type === 'webhook' ? ['allowPrivate' as const] : []),
              'includeUrl',
            ] as const
          ).map((key) => (
            <Field orientation="horizontal" key={key}>
              <Checkbox
                id={`notification-${key}`}
                checked={form[key]}
                onCheckedChange={(value) => setForm({ ...form, [key]: value === true })}
              />
              <FieldLabel htmlFor={`notification-${key}`}>
                {t(
                  key === 'allowPrivate'
                    ? 'notifications.private'
                    : key === 'includeUrl'
                      ? 'notifications.includeUrl'
                      : 'notifications.enabled',
                )}
              </FieldLabel>
            </Field>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {t('notifications.save')}
            </Button>
            {editing !== null && (
              <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                {t('notifications.cancel')}
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
      {message && (
        <div role="status">
          <Alert variant={message.error ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        </div>
      )}
    </section>
  );
}
