import { Spinner } from '@/components/ui/spinner';
import { PasswordInput } from '@/components/password-input';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { labels, type ConnectionFormState } from './connection-model';
import { t } from '@/i18n';

type Props = {
  form: ConnectionFormState;
  editing: boolean;
  hasCa: boolean;
  busy: boolean;
  onChange: (form: ConnectionFormState) => void;
  onUpdate: (update: (current: ConnectionFormState) => ConnectionFormState) => void;
  onCaError: (message: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ConnectionForm({
  form,
  editing,
  hasCa,
  busy,
  onChange,
  onUpdate,
  onCaError,
  onSubmit,
  onCancel,
}: Props) {
  const set = (patch: Partial<ConnectionFormState>) => onChange({ ...form, ...patch });
  const hasSecret =
    form.type === 'home-assistant' || form.type === 'adguard-home' || form.type === 'proxmox';
  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            {editing
              ? t('card.edit', { name: labels[form.type] })
              : t('connections.newTitle', { type: labels[form.type] })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="connection-name">{t('connections.name')}</FieldLabel>
              <Input
                id="connection-name"
                required
                maxLength={80}
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="connection-url">{t('connections.url')}</FieldLabel>
              <Input
                id="connection-url"
                type="url"
                required
                value={form.url}
                placeholder={t('connections.urlPlaceholder')}
                onChange={(event) => set({ url: event.target.value })}
              />
            </Field>
            {form.type === 'home-assistant' && (
              <Field>
                <FieldLabel htmlFor="connection-entity">{t('connections.entity')}</FieldLabel>
                <Input
                  id="connection-entity"
                  required
                  value={form.entityId}
                  placeholder={t('connections.entityPlaceholder')}
                  onChange={(event) => set({ entityId: event.target.value })}
                />
              </Field>
            )}
            {form.type === 'uptime-kuma' && (
              <Field>
                <FieldLabel htmlFor="connection-slug">{t('connections.slug')}</FieldLabel>
                <Input
                  id="connection-slug"
                  required
                  value={form.slug}
                  onChange={(event) => set({ slug: event.target.value })}
                />
              </Field>
            )}
            {form.type === 'adguard-home' && (
              <Field>
                <FieldLabel htmlFor="connection-username">{t('connections.username')}</FieldLabel>
                <Input
                  id="connection-username"
                  required
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => set({ username: event.target.value })}
                />
              </Field>
            )}
            {form.type === 'proxmox' && (
              <Field>
                <FieldLabel htmlFor="connection-token-id">{t('proxmox.tokenId')}</FieldLabel>
                <Input
                  id="connection-token-id"
                  required={!editing}
                  value={form.tokenId}
                  placeholder={t('proxmox.tokenIdPlaceholder')}
                  onChange={(event) => set({ tokenId: event.target.value })}
                />
                {editing && <FieldDescription>{t('connections.keepSecret')}</FieldDescription>}
              </Field>
            )}
            {hasSecret && (
              <Field>
                <FieldLabel htmlFor="connection-secret">
                  {form.type === 'proxmox'
                    ? t('proxmox.secret')
                    : form.type === 'home-assistant'
                      ? t('connections.accessToken')
                      : t('connections.password')}
                </FieldLabel>
                <PasswordInput
                  id="connection-secret"
                  required={!editing}
                  autoComplete="new-password"
                  value={form.secret}
                  onChange={(event) => set({ secret: event.target.value })}
                />
                {editing && <FieldDescription>{t('connections.keepSecret')}</FieldDescription>}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="connection-ca">{t('connections.ca')}</FieldLabel>
              <Input
                id="connection-ca"
                type="file"
                accept=".pem,.crt,.cer"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  set({ ca: '' });
                  if (!file) return;
                  if (file.size > 65536) {
                    onCaError(t('connections.caTooLarge'));
                    event.target.value = '';
                    return;
                  }
                  void file
                    .text()
                    .then((ca) => onUpdate((current) => ({ ...current, ca, removeCa: false })))
                    .catch(() => onCaError(t('connections.caReadFailed')));
                }}
              />
            </Field>
            {editing && hasCa && (
              <Field orientation="horizontal">
                <Checkbox
                  id="connection-remove-ca"
                  checked={form.removeCa}
                  onCheckedChange={(checked) => set({ removeCa: checked === true })}
                />
                <FieldLabel htmlFor="connection-remove-ca">{t('connections.removeCa')}</FieldLabel>
              </Field>
            )}
            <Field orientation="horizontal" className="items-start">
              <Checkbox
                id="connection-private"
                checked={form.allowPrivate}
                onCheckedChange={(checked) => set({ allowPrivate: checked === true })}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="connection-private">
                  {t('connections.allowPrivate')}
                </FieldLabel>
                <FieldDescription>{t('connections.allowPrivateHint')}</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {t('connections.save')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
