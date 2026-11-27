import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Spinner } from '@homora/ui/spinner';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { oidcFailed, type OidcAccount } from '@/hooks/use-oidc';
import { formatDateTime, t } from '@/i18n';

/**
 * Links or unlinks the one identity at the configured sign-in provider. Both steps ask for the
 * password again. Linking leaves for the provider and returns to this page.
 */
export function OidcForm({
  account,
  onLink,
  onUnlink,
  onChanged,
  linkBlocked,
}: {
  account: OidcAccount;
  onLink: (password: string) => Promise<true | { error: string }>;
  onUnlink: (password: string) => Promise<true | { error: string }>;
  /** The link was removed; the server ended the other sessions. */
  onChanged?: () => void;
  /** Why an identity cannot be linked right now, such as a provider that fails the test. */
  linkBlocked?: string;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const identity = account.identity;
  const name = account.name ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await (identity ? onUnlink(password) : onLink(password));
      if (oidcFailed(result)) return setError(result.error);
      setPassword('');
      if (identity) {
        toast.success(t('account.oidcUnlinked'));
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-4">
        {identity ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">
              {name} · {t('account.oidcStatusLinked')}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {t('account.oidcLinkedAt', { date: formatDateTime(identity.createdAt) })}
            </p>
          </div>
        ) : (
          <p className="text-sm">{t('account.oidcLinkIntro', { name })}</p>
        )}
        {identity && !identity.current && (
          <p role="status" className="text-sm">
            {t('account.oidcStale')}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t('account.oidcSecondFactorNote')}</p>
        {!identity && linkBlocked && (
          <p role="status" className="text-sm">
            {linkBlocked}
          </p>
        )}
        <form onSubmit={(event) => void submit(event)} aria-label={t('account.oidc')}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="oidc-password">{t('account.currentPassword')}</FieldLabel>
              <PasswordInput
                id="oidc-password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>
                {identity ? t('account.oidcUnlinkHint') : t('account.oidcPasswordHint')}
              </FieldDescription>
            </Field>
            <FormError>{error}</FormError>
            <div>
              <Button
                type="submit"
                variant={identity ? 'destructive' : 'default'}
                disabled={busy || (!identity && Boolean(linkBlocked))}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {identity ? t('account.oidcUnlinkConfirm') : t('account.oidcContinue', { name })}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </div>
    </section>
  );
}
