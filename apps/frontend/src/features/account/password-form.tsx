import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { SectionTitle } from '@/components/section-title';
import { apiError, t } from '@/i18n';

export function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (next !== confirm) {
      setError(t('account.mismatch'));
      return;
    }
    setSaving(true);
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOthers }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setError(apiError(await response?.json().catch(() => null), t('account.passwordFailed')));
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    toast.success(t('account.passwordChanged'));
    onChanged();
  }

  return (
    <section aria-labelledby="account-password" className="flex flex-col gap-4">
      <SectionTitle id="account-password">{t('account.password')}</SectionTitle>
      <form onSubmit={submit} className="max-w-md">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">{t('account.currentPassword')}</FieldLabel>
            <PasswordInput
              id="current-password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">{t('account.newPassword')}</FieldLabel>
            <PasswordInput
              id="new-password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <FieldDescription>{t('account.newPasswordHint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">{t('account.confirmPassword')}</FieldLabel>
            <PasswordInput
              id="confirm-password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <Field orientation="horizontal" className="items-start">
            <Checkbox
              id="revoke-others"
              checked={revokeOthers}
              onCheckedChange={(checked) => setRevokeOthers(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="revoke-others">{t('account.revokeOthers')}</FieldLabel>
              <FieldDescription>{t('account.revokeOthersHint')}</FieldDescription>
            </div>
          </Field>
          <FormError>{error}</FormError>
          <div>
            <Button type="submit" variant="outline" disabled={saving}>
              {t('account.changePassword')}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
