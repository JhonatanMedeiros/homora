import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { t } from '@/i18n';

/** How long a proposal waits for a decision before it expires. */
export function TtlDialog({
  open,
  onOpenChange,
  ttl,
  onTtlChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ttl: string;
  onTtlChange: (value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t('agents.ttlTitle')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          void onSave(event).then((saved) => saved && onOpenChange(false));
        }}
      >
        <Field>
          <FieldLabel htmlFor="proposal-ttl">{t('agents.ttlMinutes')}</FieldLabel>
          <Input
            id="proposal-ttl"
            type="number"
            min={1}
            max={120}
            required
            value={ttl}
            onChange={(event) => onTtlChange(event.target.value)}
          />
          <FieldDescription>{t('agents.ttlHint')}</FieldDescription>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('agents.ttlSave')}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
