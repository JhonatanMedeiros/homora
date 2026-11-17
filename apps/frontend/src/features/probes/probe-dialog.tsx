import { useState, type FormEvent } from 'react';
import {
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  CHECK_MATCH_MAX,
  PROBE_NAME_MAX,
  type CheckType,
  type ProbeInput,
} from '@homora/shared';
import { toast } from 'sonner';
import { CheckTypePicker } from '@/components/check-type-picker';
import { FormError } from '@/components/form-error';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Spinner } from '@homora/ui/spinner';
import { t } from '@/i18n';

import type { ProbeDraft } from '@/features/probes/probe-model';

export function ProbeDialog({
  draft,
  onOpenChange,
  onSave,
}: {
  /** Null keeps the dialog closed. */
  draft: ProbeDraft | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number | null, input: ProbeInput, isPublic: boolean) => Promise<void>;
}) {
  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remounted per draft so each opening starts from its own values. */}
        {draft && (
          <ProbeForm
            key={draft.id ?? `new-${draft.address}`}
            draft={draft}
            onCancel={() => onOpenChange(false)}
            onSave={async (...args) => {
              await onSave(...args);
              toast.success(t('probes.saved'));
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProbeForm({
  draft,
  onCancel,
  onSave,
}: {
  draft: ProbeDraft;
  onCancel: () => void;
  onSave: (id: number | null, input: ProbeInput, isPublic: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(draft.name);
  const [address, setAddress] = useState(draft.address);
  const [checkType, setCheckType] = useState<CheckType>(draft.checkType ?? 'http');
  const [interval, setInterval] = useState(draft.checkInterval ? String(draft.checkInterval) : '');
  const [expectedStatus, setExpectedStatus] = useState(draft.expectedStatus ?? '');
  const [match, setMatch] = useState(draft.checkMatch ?? '');
  const [allowPrivate, setAllowPrivate] = useState(draft.allowPrivate === true);
  const [isPublic, setIsPublic] = useState(draft.isPublic === true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const bodyCheck = checkType === 'keyword' || checkType === 'json';
  const usesStatus = checkType === 'http' || bodyCheck;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(
        draft.id ?? null,
        {
          name,
          address,
          checkType,
          checkInterval: interval.trim() ? Number(interval) : null,
          expectedStatus: usesStatus && expectedStatus.trim() ? expectedStatus.trim() : null,
          checkMatch: bodyCheck && match.trim() ? match.trim() : null,
          allowPrivate,
        },
        isPublic,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('probes.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {draft.id === undefined ? t('probes.dialog.addTitle') : t('probes.dialog.editTitle')}
        </DialogTitle>
        <DialogDescription>{t('probes.dialog.description')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="probe-name">{t('probes.field.name')}</FieldLabel>
            <Input
              id="probe-name"
              required
              maxLength={PROBE_NAME_MAX}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('probes.field.namePlaceholder')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="probe-check">{t('form.checkType')}</FieldLabel>
            <CheckTypePicker id="probe-check" value={checkType} onChange={setCheckType} />
            <FieldDescription>{t(`check.hint.${checkType}`, { days: 14 })}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="probe-address">{t('probes.field.address')}</FieldLabel>
            <Input
              id="probe-address"
              type="url"
              required
              maxLength={2048}
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="http://1.1.1.1"
            />
            <FieldDescription>{t('probes.field.addressHint')}</FieldDescription>
          </Field>
          {bodyCheck && (
            <Field>
              <FieldLabel htmlFor="probe-match">
                {t(checkType === 'json' ? 'check.match.json' : 'check.match.keyword')}
              </FieldLabel>
              <Input
                id="probe-match"
                required
                maxLength={CHECK_MATCH_MAX}
                autoComplete="off"
                value={match}
                onChange={(event) => setMatch(event.target.value)}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="probe-interval">{t('form.interval')}</FieldLabel>
              <Input
                id="probe-interval"
                type="number"
                inputMode="numeric"
                min={CHECK_INTERVAL_MIN}
                max={CHECK_INTERVAL_MAX}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
              <FieldDescription>
                {t('form.intervalHint', { min: CHECK_INTERVAL_MIN, max: CHECK_INTERVAL_MAX })}
              </FieldDescription>
            </Field>
            {usesStatus && (
              <Field>
                <FieldLabel htmlFor="probe-status">{t('form.expectedStatus')}</FieldLabel>
                <Input
                  id="probe-status"
                  autoComplete="off"
                  maxLength={3}
                  value={expectedStatus}
                  onChange={(event) => setExpectedStatus(event.target.value)}
                  placeholder="200"
                />
              </Field>
            )}
          </div>
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              id="probe-private"
              checked={allowPrivate}
              onCheckedChange={(checked) => setAllowPrivate(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="probe-private">{t('form.allowPrivate')}</FieldLabel>
              <FieldDescription>{t('form.allowPrivateHint')}</FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal" className="items-start rounded-lg border p-3">
            <Checkbox
              id="probe-public"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="probe-public">{t('probes.field.public')}</FieldLabel>
              <FieldDescription>{t('probes.field.publicHint')}</FieldDescription>
            </div>
          </Field>
        </FieldGroup>
        <FormError>{error}</FormError>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Spinner />}
            {saving ? t('probes.saving') : t('probes.save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
