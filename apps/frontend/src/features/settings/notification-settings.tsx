import { Spinner } from '@/components/ui/spinner';
import { Bell, MessageSquare, Plus, Send, Webhook } from 'lucide-react';
import { SectionTitle } from '@/components/section-title';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { t, formatDateTime } from '@/i18n';
import { SectionSkeleton } from '@/components/skeletons';
import { useNotificationSettings } from '@/hooks/use-notification-settings';

export function NotificationSettings() {
  const {
    channels,
    form,
    setForm,
    editing,
    openType,
    busy,
    message,
    edit,
    reset,
    add,
    save,
    action,
  } = useNotificationSettings();
  const groups = [
    {
      type: 'webhook' as const,
      title: 'notifications.webhooks' as const,
      hint: 'notifications.webhooksHint' as const,
      add: 'notifications.addWebhook' as const,
      empty: 'notifications.noWebhooks' as const,
      icon: Webhook,
    },
    {
      type: 'telegram' as const,
      title: 'notifications.telegram' as const,
      hint: 'notifications.telegramHint' as const,
      add: 'notifications.addTelegram' as const,
      empty: 'notifications.noTelegram' as const,
      icon: Send,
    },
    {
      type: 'ntfy' as const,
      title: 'notifications.ntfy' as const,
      hint: 'notifications.ntfyHint' as const,
      add: 'notifications.addNtfy' as const,
      empty: 'notifications.noNtfy' as const,
      icon: Bell,
    },
    {
      type: 'discord' as const,
      title: 'notifications.discord' as const,
      hint: 'notifications.discordHint' as const,
      add: 'notifications.addDiscord' as const,
      empty: 'notifications.noDiscord' as const,
      icon: MessageSquare,
    },
  ];
  return (
    <section aria-labelledby="notifications-title" className="flex flex-col gap-8">
      <div>
        <h2 id="notifications-title" className="text-xl">
          {t('notifications.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('notifications.hint')}</p>
      </div>
      {message && (
        <div role="status">
          <Alert variant={message.error ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        </div>
      )}
      {!channels && !message?.error && <SectionSkeleton label={t('notifications.loading')} />}
      {channels &&
        groups.map((group) => {
          const items = channels.filter((channel) => channel.type === group.type);
          const active = openType === group.type;
          return (
            <section
              key={group.type}
              aria-labelledby={`notifications-${group.type}-title`}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <SectionTitle
                  id={`notifications-${group.type}-title`}
                  count={items.length}
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || openType !== null}
                      onClick={() => add(group.type)}
                    >
                      <Plus data-icon="inline-start" />
                      {t(group.add)}
                    </Button>
                  }
                >
                  {t(group.title)}
                </SectionTitle>
                <p className="text-sm text-muted-foreground">{t(group.hint)}</p>
              </div>
              {items.length === 0 && !active && (
                <p className="text-sm text-muted-foreground">{t(group.empty)}</p>
              )}
              {items.map((channel) => (
                <div key={channel.id} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <group.icon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <div>
                      <h3 className="font-medium">{channel.name}</h3>
                      {!channel.enabled && (
                        <p className="text-sm text-muted-foreground">
                          {t('notifications.disabled')}
                        </p>
                      )}
                    </div>
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
                      disabled={busy || openType !== null}
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
              ))}
              {active && (
                <div className="flex flex-col gap-4 rounded-lg border p-4">
                  <h3 className="font-medium">
                    {editing === null
                      ? t(
                          group.type === 'webhook'
                            ? 'notifications.newWebhook'
                            : group.type === 'ntfy'
                              ? 'notifications.newNtfy'
                              : group.type === 'discord'
                                ? 'notifications.newDiscord'
                                : 'notifications.newTelegram',
                        )
                      : t('notifications.editChannel', { name: form.name })}
                  </h3>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="notification-name">
                          {t('notifications.name')}
                        </FieldLabel>
                        <Input
                          id="notification-name"
                          required
                          maxLength={100}
                          value={form.name}
                          onChange={(event) => setForm({ ...form, name: event.target.value })}
                        />
                      </Field>
                      {form.type !== 'telegram' ? (
                        <>
                          <Field>
                            <FieldLabel htmlFor="notification-destination">
                              {t(
                                form.type === 'ntfy'
                                  ? 'notifications.urlNtfy'
                                  : form.type === 'discord'
                                    ? 'notifications.urlDiscord'
                                    : 'notifications.url',
                              )}
                            </FieldLabel>
                            <Input
                              id="notification-destination"
                              type="password"
                              autoComplete="off"
                              required={editing === null}
                              value={form.destination}
                              onChange={(event) =>
                                setForm({ ...form, destination: event.target.value })
                              }
                            />
                            {editing !== null && (
                              <FieldDescription>{t('notifications.keep')}</FieldDescription>
                            )}
                          </Field>
                          {form.type === 'ntfy' && (
                            <Field>
                              <FieldLabel htmlFor="notification-token">
                                {t('notifications.ntfyToken')}
                              </FieldLabel>
                              <Input
                                id="notification-token"
                                type="password"
                                autoComplete="off"
                                value={form.token}
                                onChange={(event) =>
                                  setForm({ ...form, token: event.target.value })
                                }
                              />
                              {editing !== null && (
                                <FieldDescription>{t('notifications.keep')}</FieldDescription>
                              )}
                            </Field>
                          )}
                        </>
                      ) : (
                        <>
                          <Field>
                            <FieldLabel htmlFor="notification-token">
                              {t('notifications.token')}
                            </FieldLabel>
                            <Input
                              id="notification-token"
                              type="password"
                              autoComplete="off"
                              required={editing === null}
                              value={form.token}
                              onChange={(event) => setForm({ ...form, token: event.target.value })}
                            />
                            {editing !== null && (
                              <FieldDescription>{t('notifications.keep')}</FieldDescription>
                            )}
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="notification-chat">
                              {t('notifications.chat')}
                            </FieldLabel>
                            <Input
                              id="notification-chat"
                              type="password"
                              autoComplete="off"
                              required={editing === null}
                              value={form.chatId}
                              onChange={(event) => setForm({ ...form, chatId: event.target.value })}
                            />
                            {editing !== null && (
                              <FieldDescription>{t('notifications.keep')}</FieldDescription>
                            )}
                          </Field>
                        </>
                      )}
                      {form.type !== 'webhook' && (
                        <Field>
                          <FieldLabel htmlFor="notification-locale">
                            {t('notifications.language')}
                          </FieldLabel>
                          <FormSelect
                            id="notification-locale"
                            value={form.locale}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                locale: event.target.value === 'pt-BR' ? 'pt-BR' : 'en',
                              })
                            }
                          >
                            <FormSelectOption value="en">English</FormSelectOption>
                            <FormSelectOption value="pt-BR">Português (Brasil)</FormSelectOption>
                          </FormSelect>
                          <FieldDescription>{t('notifications.languageHint')}</FieldDescription>
                        </Field>
                      )}
                      {(
                        [
                          'enabled',
                          ...(form.type === 'webhook' || form.type === 'ntfy'
                            ? ['allowPrivate' as const]
                            : []),
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
                          {busy && <Spinner data-icon="inline-start" />}
                          {t('notifications.save')}
                        </Button>
                        {
                          <Button type="button" variant="outline" disabled={busy} onClick={reset}>
                            {t('notifications.cancelForm')}
                          </Button>
                        }
                      </div>
                    </FieldGroup>
                  </form>
                </div>
              )}
            </section>
          );
        })}
    </section>
  );
}
