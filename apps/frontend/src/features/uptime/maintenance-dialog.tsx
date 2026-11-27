import { toast } from 'sonner';
import { useState, type FormEvent } from 'react';
import { MAINTENANCE_NOTE_MAX, type Service } from '@homora/shared';
import { FormError } from '@/components/form-error';
import { Button } from '@homora/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Spinner } from '@homora/ui/spinner';
import { apiError, t } from '@/i18n';
import { fromLocalInput, toLocalInput, validWindow } from '@/features/uptime/maintenance-view';
import { MaintenanceReview } from './maintenance-review';

export function MaintenanceDialog({
  open,
  serviceId,
  serviceName,
  services,
  onOpenChange,
  onScheduled,
}: {
  open: boolean;
  serviceId: number;
  serviceName: string;
  services?: Pick<Service, 'id' | 'name'>[];
  onOpenChange: (open: boolean) => void;
  onScheduled: () => void;
}) {
  // Starts at the next quarter hour and lasts an hour: the common case needs no typing.
  const [initial] = useState(() => Math.ceil(Date.now() / 900_000) * 900_000);
  const [start, setStart] = useState(() => toLocalInput(initial));
  const [end, setEnd] = useState(() => toLocalInput(initial + 3_600_000));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = fromLocalInput(start);
    const endsAt = fromLocalInput(end);
    if (!validWindow(startsAt, endsAt)) {
      setError(t('maint.invalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/services/${serviceId}/maintenance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startsAt, endsAt, note: note.trim() }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(apiError(body, t('maint.error')));
      }
      toast.success(t('maint.scheduled'));
      onScheduled();
      onOpenChange(false);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t('maint.error');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('maint.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('maint.dialog.description', { name: serviceName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="maintenance-start">{t('maint.start')}</FieldLabel>
              <Input
                id="maintenance-start"
                type="datetime-local"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="maintenance-end">{t('maint.finish')}</FieldLabel>
              <Input
                id="maintenance-end"
                type="datetime-local"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="maintenance-note">{t('maint.note')}</FieldLabel>
              <Input
                id="maintenance-note"
                maxLength={MAINTENANCE_NOTE_MAX}
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('maint.notePlaceholder')}
              />
            </Field>
          </FieldGroup>
          <MaintenanceReview
            serviceId={serviceId}
            services={services}
            startsAt={fromLocalInput(start)}
            endsAt={fromLocalInput(end)}
          />
          <FormError>{error}</FormError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner />}
              {saving ? t('maint.saving') : t('maint.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
