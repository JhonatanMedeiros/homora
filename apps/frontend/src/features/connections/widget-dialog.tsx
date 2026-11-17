import { Spinner } from '@homora/ui/spinner';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { t } from '@/i18n';
import type { Connection } from './connection-model';
import type { WidgetFormState } from './use-connections-page';

type Props = {
  form: WidgetFormState | null;
  items: Connection[];
  cards: { id: number; name: string }[];
  busy: boolean;
  onChange: (form: WidgetFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
};

/** Create or edit a widget; the connection is chosen on creation and fixed afterwards. */
export function WidgetDialog({ form, items, cards, busy, onChange, onSubmit, onClose }: Props) {
  const editing = form?.id != null;
  return (
    <ResponsiveDialog
      open={form !== null}
      onOpenChange={(open) => !open && onClose()}
      title={editing ? t('widgets.edit') : t('widgets.new')}
      description={editing ? undefined : t('widgets.createHint')}
    >
      {form && (
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="widget-name">{t('widgets.name')}</FieldLabel>
              <Input
                id="widget-name"
                required
                autoFocus
                maxLength={80}
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="widget-connection">{t('widgets.connection')}</FieldLabel>
              <FormSelect
                id="widget-connection"
                aria-label={t('widgets.connection')}
                required
                disabled={editing}
                value={form.connection}
                onChange={(event) => onChange({ ...form, connection: event.target.value })}
              >
                {items.map((item) => (
                  <FormSelectOption key={item.id} value={item.id}>
                    {item.name}
                  </FormSelectOption>
                ))}
              </FormSelect>
              {editing && <FieldDescription>{t('widgets.connectionFixed')}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="widget-card">{t('widgets.card')}</FieldLabel>
              <FormSelect
                id="widget-card"
                aria-label={t('widgets.card')}
                value={form.card}
                onChange={(event) => onChange({ ...form, card: event.target.value })}
              >
                <FormSelectOption value="">{t('widgets.noCard')}</FormSelectOption>
                {cards.map((card) => (
                  <FormSelectOption key={card.id} value={card.id}>
                    {card.name}
                  </FormSelectOption>
                ))}
              </FormSelect>
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy || !form.name.trim() || !form.connection}>
                {busy && <Spinner data-icon="inline-start" />}
                {editing ? t('widgets.save') : t('widgets.create')}
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
    </ResponsiveDialog>
  );
}
