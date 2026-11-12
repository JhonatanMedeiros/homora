import { Spinner } from '@/components/ui/spinner';
import { PasswordInput } from '@/components/password-input';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  extraFields,
  labels,
  secretField,
  urlField,
  type ConnectionFormState,
} from './connection-model';
import { t, tOr } from '@/i18n';
import { NodePicker } from './node-picker';

type Props = {
  form: ConnectionFormState;
  editing: boolean;
  /** Id of the saved connection being edited; choice lists need it. */
  connectionId?: number | null;
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
  connectionId,
  hasCa,
  busy,
  onChange,
  onUpdate,
  onCaError,
  onSubmit,
  onCancel,
}: Props) {
  const set = (patch: Partial<ConnectionFormState>) => onChange({ ...form, ...patch });
  const secret = secretField(form.type);
  // Help text from the definition; a message `integration.<type>.<field>.help` translates it.
  const help = (field: { key: string; help?: string } | undefined) =>
    field?.help ? tOr(`integration.${form.type}.${field.key}.help`, field.help) : undefined;
  const urlHelp = help(urlField(form.type));
  const secretHelp = help(secret);
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
              {urlHelp && <FieldDescription>{urlHelp}</FieldDescription>}
            </Field>
            {extraFields(form.type).map((field) =>
              field.picker && connectionId == null ? null : (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`connection-field-${field.key}`}>
                    {tOr(field.labelKey, field.label)}
                  </FieldLabel>
                  {field.picker && connectionId != null ? (
                    <NodePicker
                      id={`connection-field-${field.key}`}
                      connectionId={connectionId}
                      value={form.values[field.key] ?? ''}
                      onChange={(value) => set({ values: { ...form.values, [field.key]: value } })}
                    />
                  ) : (
                    <Input
                      id={`connection-field-${field.key}`}
                      required={field.required && !(editing && field.kind === 'token-id')}
                      maxLength={field.maxLength}
                      autoComplete={field.identity ? 'username' : undefined}
                      value={form.values[field.key] ?? ''}
                      placeholder={
                        field.placeholderKey || field.placeholder
                          ? tOr(field.placeholderKey, field.placeholder ?? '')
                          : undefined
                      }
                      onChange={(event) =>
                        set({ values: { ...form.values, [field.key]: event.target.value } })
                      }
                    />
                  )}
                  {editing && field.kind === 'token-id' && (
                    <FieldDescription>{t('connections.keepSecret')}</FieldDescription>
                  )}
                  {field.help && <FieldDescription>{field.help}</FieldDescription>}
                </Field>
              ),
            )}
            {secret && (
              <Field>
                <FieldLabel htmlFor="connection-secret">
                  {tOr(secret.labelKey, secret.label)}
                </FieldLabel>
                <PasswordInput
                  id="connection-secret"
                  required={!editing}
                  maxLength={secret.maxLength}
                  autoComplete="new-password"
                  value={form.secret}
                  onChange={(event) => set({ secret: event.target.value })}
                />
                {secretHelp && <FieldDescription>{secretHelp}</FieldDescription>}
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
