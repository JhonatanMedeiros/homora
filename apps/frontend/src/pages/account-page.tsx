import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { FormError } from '@/components/form-error';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@homora/ui/button';
import {
  IdentityCard,
  ProtectionSummary,
  SecurityCard,
  type Protection,
} from '@/features/account/account-overview';
import { PasswordForm } from '@/features/account/password-form';
import { ProfileForm } from '@/features/account/profile-form';
import { PasskeysForm } from '@/features/account/passkeys-form';
import { TwoFactorForm } from '@/features/account/two-factor-form';
import { SignInActivity } from '@/features/account/sign-in-activity';
import { SessionsList } from '@/features/account/sessions-list';
import type { Profile } from '@/features/account/account-model';
import { failed, passkeyAvailability, usePasskeyOrigins, usePasskeys } from '@/hooks/use-passkeys';
import { t } from '@/i18n';

type Panel = 'profile' | 'password' | 'twoFactor' | 'passkeys';

export function AccountPage({
  profile,
  failed: loadFailed,
  onProfileChange,
}: {
  profile: Profile | null;
  failed: boolean;
  onProfileChange: (profile: Profile) => void;
}) {
  // Changing the password can end other sessions, so the list reloads afterwards.
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  // The button that opened a panel may already say what to do, so the panel skips its own prompt.
  const [direct, setDirect] = useState(false);
  const open = (next: Panel, skipPrompt = false) => {
    setDirect(skipPrompt);
    setPanel(next);
  };
  const [locked, setLocked] = useState(false);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
  const passkeys = usePasskeys();
  const origins = usePasskeyOrigins();

  useEffect(() => {
    let active = true;
    void passkeys.list().then((result) => {
      if (active && !failed(result)) setPasskeyCount(result.length);
    });
    return () => {
      active = false;
    };
    // The calls are stable; the count loads once and the passkey dialog keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => setPanel(null), []);
  const sessionsChanged = useCallback(() => setSessionsVersion((value) => value + 1), []);

  // Passkeys only count as a protection where this browser and address can use them.
  const passkeyUsable =
    (passkeyCount ?? 0) > 0 ||
    (origins !== undefined && passkeyAvailability(origins) === 'available');
  const canAddPasskey = origins !== undefined && passkeyAvailability(origins) === 'available';
  const protections: Protection[] = profile
    ? [
        {
          id: 'password',
          label: t('account.passwordSet'),
          active: true,
          status: t('account.statusActive'),
        },
        {
          id: 'twoFactor',
          label: t('account.twoFactor'),
          active: profile.twoFactorEnabled,
          status: t(profile.twoFactorEnabled ? 'account.statusActive' : 'account.statusOff'),
          action: { label: t('account.twoFactorEnable'), onClick: () => open('twoFactor', true) },
        },
        ...(passkeyUsable
          ? [
              {
                id: 'passkeys' as const,
                label: t('account.passkeys'),
                active: (passkeyCount ?? 0) > 0,
                status:
                  (passkeyCount ?? 0) > 0
                    ? t('account.passkeysCount', { count: passkeyCount ?? 0 })
                    : t('account.passkeysNone'),
                action: {
                  label: t('account.passkeyAdd'),
                  onClick: () => open('passkeys', canAddPasskey),
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <section aria-label={t('account.title')} className="flex flex-col gap-8">
      <PageHeader title={t('account.title')} description={t('account.description')} />
      {profile ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <IdentityCard profile={profile} onEdit={() => open('profile')} />
            <ProtectionSummary items={protections} />
          </div>
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            <SecurityCard
              icon={<Lock />}
              title={t('account.password')}
              description={t('account.passwordCardHint')}
              action={
                <Button type="button" variant="outline" onClick={() => open('password')}>
                  {t('account.changePassword')}
                </Button>
              }
            />
            <SecurityCard
              icon={<Smartphone />}
              title={t('account.twoFactor')}
              description={t('account.twoFactorDescription')}
              action={
                <Button
                  type="button"
                  variant={profile.twoFactorEnabled ? 'outline' : 'default'}
                  onClick={() => open('twoFactor', !profile.twoFactorEnabled)}
                >
                  {t(profile.twoFactorEnabled ? 'account.manage' : 'account.twoFactorEnable')}
                </Button>
              }
            />
            <SecurityCard
              icon={<KeyRound />}
              title={t('account.passkeys')}
              description={t('account.passkeysDescription')}
              action={
                <Button type="button" variant="outline" onClick={() => open('passkeys')}>
                  {t('account.manage')}
                </Button>
              }
            />
          </div>
        </>
      ) : (
        <FormError>{loadFailed ? t('account.loadFailed') : ''}</FormError>
      )}
      <SignInActivity refreshKey={sessionsVersion} />
      <SessionsList refreshKey={sessionsVersion} />

      {profile && (
        <>
          <ResponsiveDialog
            open={panel === 'profile'}
            onOpenChange={(open) => !open && close()}
            title={t('account.profile')}
          >
            <ProfileForm embedded profile={profile} onChange={onProfileChange} onDone={close} />
          </ResponsiveDialog>
          <ResponsiveDialog
            open={panel === 'password'}
            onOpenChange={(open) => !open && close()}
            title={t('account.password')}
          >
            <PasswordForm
              embedded
              onChanged={() => {
                sessionsChanged();
                close();
              }}
            />
          </ResponsiveDialog>
          <ResponsiveDialog
            open={panel === 'twoFactor'}
            onOpenChange={(open) => !open && close()}
            title={t('account.twoFactor')}
            locked={locked}
          >
            <TwoFactorForm
              embedded
              startEnabling={direct}
              enabled={profile.twoFactorEnabled}
              onLockedChange={setLocked}
              onChanged={(twoFactorEnabled) => {
                onProfileChange({ ...profile, twoFactorEnabled });
                sessionsChanged();
              }}
            />
          </ResponsiveDialog>
          <ResponsiveDialog
            open={panel === 'passkeys'}
            onOpenChange={(open) => !open && close()}
            title={t('account.passkeys')}
          >
            <PasskeysForm
              embedded
              startAdding={direct}
              twoFactorEnabled={profile.twoFactorEnabled}
              onChanged={sessionsChanged}
              onCountChange={setPasskeyCount}
            />
          </ResponsiveDialog>
        </>
      )}
    </section>
  );
}
