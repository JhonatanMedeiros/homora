import { Spinner } from '@/components/ui/spinner';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/password-input';
import { FormError } from '@/components/form-error';
import { SectionTitle } from '@/components/section-title';
import { t } from '@/i18n';
import { useAccountMutations } from '@/hooks/use-account-mutations';
import type { Profile } from './account-model';

export function ProfileForm({
  profile,
  onChange,
  onDone,
  embedded = false,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  /** Everything asked for was saved. */
  onDone?: () => void;
  /** Inside a dialog that already shows the title. */
  embedded?: boolean;
}) {
  const [current, setCurrent] = useState(profile);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { saveProfile, changeEmail } = useAccountMutations();
  const nameChanged = name.trim() !== current.name;
  const emailChanged = email.trim().toLowerCase() !== current.email;
  const ready =
    !saving &&
    !!name.trim() &&
    !!email.trim() &&
    (nameChanged || emailChanged) &&
    (!emailChanged || password.length > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    let latest = current;
    let failure: string | undefined;
    if (nameChanged) {
      const result = await saveProfile(name);
      if (result.profile) latest = result.profile;
      else failure = result.error ?? t('account.profileFailed');
    }
    if (!failure && emailChanged) {
      const result = await changeEmail(email, password);
      if (result.profile) latest = result.profile;
      else failure = result.error ?? t('account.profileFailed');
    }
    setSaving(false);
    if (latest !== current) {
      setCurrent(latest);
      setName(latest.name);
      setEmail(latest.email);
      onChange(latest);
    }
    if (failure) {
      setError(failure);
      toast.error(failure);
      return;
    }
    setPassword('');
    toast.success(emailChanged ? t('account.emailChanged') : t('account.profileSaved'));
    onDone?.();
  }

  return (
    <section
      aria-labelledby={embedded ? undefined : 'account-profile'}
      className="flex flex-col gap-4"
    >
      {!embedded && <SectionTitle id="account-profile">{t('account.profile')}</SectionTitle>}
      <form onSubmit={submit} className="max-w-md">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="account-name">{t('account.name')}</FieldLabel>
            <Input
              id="account-name"
              required
              maxLength={80}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-email">{t('account.email')}</FieldLabel>
            <Input
              id="account-email"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldDescription>{t('account.emailHint')}</FieldDescription>
          </Field>
          {emailChanged && (
            <Field>
              <FieldLabel htmlFor="account-email-password">
                {t('account.currentPassword')}
              </FieldLabel>
              <PasswordInput
                id="account-email-password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>{t('account.emailChangeHint')}</FieldDescription>
            </Field>
          )}
          <FormError>{error}</FormError>
          <div>
            <Button type="submit" disabled={!ready}>
              {saving && <Spinner data-icon="inline-start" />}
              {t('account.saveProfile')}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
