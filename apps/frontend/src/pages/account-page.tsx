import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { FormError } from '@/components/form-error';
import { PasswordForm } from '@/features/account/password-form';
import { ProfileForm } from '@/features/account/profile-form';
import { PasskeysForm } from '@/features/account/passkeys-form';
import { TwoFactorForm } from '@/features/account/two-factor-form';
import { SessionsList } from '@/features/account/sessions-list';
import type { Profile } from '@/features/account/account-model';
import { t } from '@/i18n';

export function AccountPage({
  profile,
  failed,
  onProfileChange,
}: {
  profile: Profile | null;
  failed: boolean;
  onProfileChange: (profile: Profile) => void;
}) {
  // Changing the password can end other sessions, so the list reloads afterwards.
  const [sessionsVersion, setSessionsVersion] = useState(0);
  return (
    <section aria-label={t('account.title')} className="flex flex-col gap-8">
      <PageHeader title={t('account.title')} description={t('account.description')} />
      {profile ? (
        <ProfileForm key={profile.name} profile={profile} onChange={onProfileChange} />
      ) : (
        <FormError>{failed ? t('account.loadFailed') : ''}</FormError>
      )}
      <PasswordForm onChanged={() => setSessionsVersion((value) => value + 1)} />
      {profile && (
        <TwoFactorForm
          enabled={profile.twoFactorEnabled}
          onChanged={(twoFactorEnabled) => {
            onProfileChange({ ...profile, twoFactorEnabled });
            setSessionsVersion((value) => value + 1);
          }}
        />
      )}
      {profile && (
        <PasskeysForm
          twoFactorEnabled={profile.twoFactorEnabled}
          onChanged={() => setSessionsVersion((value) => value + 1)}
        />
      )}
      <SessionsList refreshKey={sessionsVersion} />
    </section>
  );
}
