import { Spinner } from '@/components/ui/spinner';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/form-error';
import { SectionTitle } from '@/components/section-title';
import { t } from '@/i18n';
import { useAccountMutations } from '@/hooks/use-account-mutations';
import type { Profile } from './account-model';

export function ProfileForm({
  profile,
  onChange,
  embedded = false,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  /** Inside a dialog that already shows the title. */
  embedded?: boolean;
}) {
  const [name, setName] = useState(profile.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { saveProfile } = useAccountMutations();
  const unchanged = name.trim() === profile.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    const result = await saveProfile(name);
    setSaving(false);
    if (!result.profile) {
      const message = result.error ?? t('account.profileFailed');
      setError(message);
      toast.error(message);
      return;
    }
    const saved = result.profile;
    onChange(saved);
    setName(saved.name);
    toast.success(t('account.profileSaved'));
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
            <Input id="account-email" type="email" value={profile.email} readOnly />
            <FieldDescription>{t('account.emailHint')}</FieldDescription>
          </Field>
          <FormError>{error}</FormError>
          <div>
            <Button type="submit" disabled={saving || unchanged || !name.trim()}>
              {saving && <Spinner data-icon="inline-start" />}
              {t('account.saveProfile')}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}
