import { PasswordInput } from '@/components/password-input';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { emptyForm, labels, type ConnectionFormState, type Kind } from './connection-model';
import { NativeSelect } from '@/components/native-select';
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
  const hasSecret = form.type === 'home-assistant' || form.type === 'adguard-home';
  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="connection-type">{t('connections.type')}</FieldLabel>
              <NativeSelect
                id="connection-type"
                value={form.type}
                disabled={editing}
                onChange={(event) => onChange({ ...emptyForm, type: event.target.value as Kind })}
              >
                {Object.entries(labels).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
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
            {hasSecret && (
              <Field>
                <FieldLabel htmlFor="connection-secret">
                  {form.type === 'home-assistant'
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
            {t('connections.save')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
