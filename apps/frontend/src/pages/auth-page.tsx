import { PasswordInput } from '@/components/password-input';
import { KeyRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { AuthStatus, Credentials } from '@/hooks/use-auth';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { BrandMark } from '@/components/brand-mark';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { AuthShowcase } from '@/features/auth/auth-showcase';
import { TwoFactorChallenge } from '@/features/auth/two-factor-challenge';
import { passkeyAvailability } from '@/hooks/use-passkeys';
import { t } from '@/i18n';

type Props = {
  status: AuthStatus | null;
  error: string;
  /** The password was accepted and the second step is pending. */
  challenge?: boolean;
  onSubmit: (credentials: Credentials) => Promise<boolean>;
  /** Signs in with a passkey; `rememberMe` is the form's "keep me signed in" choice. */
  onPasskey?: (rememberMe: boolean) => Promise<boolean>;
  onVerify?: (code: string, recovery: boolean) => Promise<boolean>;
  onCancelChallenge?: () => void;
  onRetry?: () => void;
};

/** Admin account setup and sign in. */
export function AuthPage({
  status,
  error,
  challenge = false,
  onSubmit,
  onPasskey,
  onVerify,
  onCancelChallenge,
  onRetry,
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const passkey = status?.configured ? passkeyAvailability(status.passkey?.origins) : null;

  async function startPasskey() {
    if (pending.current || !onPasskey) return;
    pending.current = true;
    setBusy(true);
    try {
      await onPasskey(rememberMe);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    const creating = !status?.configured;
    setMismatch(creating && password !== confirmation);
    if (creating && password !== confirmation) return;
    pending.current = true;
    setBusy(true);
    try {
      if (await onSubmit({ name: name.trim(), email: email.trim(), password, rememberMe })) {
        setPassword('');
        setConfirmation('');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1.1fr_1fr]">
      <AuthShowcase />
      <div className="grid place-items-center p-4 sm:p-8 lg:p-12">
        <div className="flex w-full max-w-sm flex-col gap-6 2xl:max-w-md">
          <div className="flex items-center justify-between">
            <BrandMark className="text-2xl" />
            <LocaleSwitcher />
          </div>
          <Card>
            {status && challenge && onVerify ? (
              <TwoFactorChallenge
                error={error}
                onVerify={onVerify}
                onCancel={onCancelChallenge ?? (() => undefined)}
              />
            ) : status ? (
              <>
                <CardHeader>
                  <h1 className="text-2xl">
                    {status.configured ? t('auth.welcomeBack') : t('auth.createAdmin')}
                  </h1>
                  <CardDescription>
                    {status.configured ? t('auth.signInHint') : t('auth.setupHint')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void submit(e)}>
                    <FieldGroup>
                      {!status.configured && (
                        <Field>
                          <FieldLabel htmlFor="name">{t('auth.name')}</FieldLabel>
                          <Input
                            id="name"
                            autoFocus
                            required
                            maxLength={80}
                            autoComplete="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </Field>
                      )}
                      <Field>
                        <FieldLabel htmlFor="email">{t('auth.email')}</FieldLabel>
                        <Input
                          id="email"
                          type="email"
                          autoFocus={status.configured}
                          required
                          maxLength={254}
                          autoComplete="username"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
                        <PasswordInput
                          id="password"
                          required
                          minLength={8}
                          maxLength={1024}
                          autoComplete={status.configured ? 'current-password' : 'new-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </Field>
                      {!status.configured && (
                        <Field>
                          <FieldLabel htmlFor="confirm-password">
                            {t('auth.confirmPassword')}
                          </FieldLabel>
                          <PasswordInput
                            id="confirm-password"
                            required
                            minLength={8}
                            maxLength={1024}
                            autoComplete="new-password"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                          />
                        </Field>
                      )}
                      {status.configured && (
                        <Field orientation="horizontal">
                          <Checkbox
                            id="remember-me"
                            checked={rememberMe}
                            onCheckedChange={(checked) => setRememberMe(checked === true)}
                          />
                          <FieldLabel htmlFor="remember-me">{t('auth.rememberMe')}</FieldLabel>
                        </Field>
                      )}
                      <FormError>{mismatch ? t('auth.passwordMismatch') : error}</FormError>
                      <Button type="submit" disabled={busy}>
                        {busy && <Spinner data-icon="inline-start" />}
                        {busy
                          ? t('auth.submitting')
                          : status.configured
                            ? t('auth.signIn')
                            : t('auth.createAccount')}
                      </Button>
                      {passkey === 'available' && onPasskey && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void startPasskey()}
                        >
                          <KeyRound data-icon="inline-start" />
                          {t('auth.passkeySignIn')}
                        </Button>
                      )}
                      {passkey && passkey !== 'available' && (
                        <p className="text-sm text-muted-foreground">
                          {passkey === 'no-browser'
                            ? t('auth.passkeyNoBrowser')
                            : t('auth.passkeyWrongOrigin', {
                                origins: status.passkey?.origins.join(', ') ?? '',
                              })}
                        </p>
                      )}
                    </FieldGroup>
                  </form>
                </CardContent>
              </>
            ) : (
              <CardContent>
                <p role="status" className="flex items-center gap-2 text-muted-foreground">
                  {!error && <Spinner />}
                  {error || t('auth.connecting')}
                </p>
                {error && onRetry && (
                  <Button className="mt-4" onClick={onRetry}>
                    {t('error.retry')}
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
