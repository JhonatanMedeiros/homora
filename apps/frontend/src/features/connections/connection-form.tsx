import { Spinner } from '@homora/ui/spinner';
import { PasswordInput } from '@/components/password-input';
import type { FormEvent } from 'react';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { ChevronDown } from 'lucide-react';
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
  /** Focus the credentials field first, for a connection whose credentials were rejected. */
  focusSecret?: boolean;
  busy: boolean;
  saveTesting: boolean;
  onChange: (form: ConnectionFormState) => void;
  onUpdate: (update: (current: ConnectionFormState) => ConnectionFormState) => void;
  onCaError: (message: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSaveAndTest: () => void;
  onCancel: () => void;
};

export function ConnectionForm({
  form,
  editing,
  connectionId,
  hasCa,
  focusSecret = false,
  busy,
  saveTesting,
  onChange,
  onUpdate,
  onCaError,
  onSubmit,
  onSaveAndTest,
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
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Only the fields scroll; the title above and the buttons below stay in view. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
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
          {extraFields(form.type).length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-4">
              <h3 className="text-sm font-semibold">{t('connections.serviceSettings')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('connections.serviceSettingsHint', { name: labels[form.type] })}
              </p>
            </div>
          )}
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 [&>*:only-child]:sm:col-span-2">
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
                  {help(field) && <FieldDescription>{help(field)}</FieldDescription>}
                </Field>
              ),
            )}
          </div>
          {secret && (
            <Field>
              <FieldLabel htmlFor="connection-secret">
                {tOr(secret.labelKey, secret.label)}
              </FieldLabel>
              <PasswordInput
                id="connection-secret"
                required={!editing}
                autoFocus={focusSecret}
                maxLength={secret.maxLength}
                autoComplete="new-password"
                value={form.secret}
                onChange={(event) => set({ secret: event.target.value })}
              />
              {secretHelp && <FieldDescription>{secretHelp}</FieldDescription>}
              {editing && <FieldDescription>{t('connections.keepSecret')}</FieldDescription>}
            </Field>
          )}
          <Collapsible defaultOpen={editing && hasCa} className="group/advanced border-t pt-4">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{t('connections.advanced')}</span>
                <span className="text-sm text-muted-foreground">
                  {t('connections.advancedHint')}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/advanced:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <FieldGroup>
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
                    <FieldLabel htmlFor="connection-remove-ca">
                      {t('connections.removeCa')}
                    </FieldLabel>
                  </Field>
                )}
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
          <Field orientation="horizontal" className="items-start">
            <Checkbox
              id="connection-private"
              checked={form.allowPrivate}
              onCheckedChange={(checked) => set({ allowPrivate: checked === true })}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="connection-private">{t('connections.allowPrivate')}</FieldLabel>
              <FieldDescription>{t('connections.allowPrivateHint')}</FieldDescription>
            </div>
          </Field>
        </FieldGroup>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && !saveTesting && <Spinner data-icon="inline-start" />}
          {t('connections.save')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onSaveAndTest}>
          {saveTesting && <Spinner data-icon="inline-start" />}
          {t('connections.saveAndTest')}
        </Button>
      </div>
    </form>
  );
}
