import { PasswordInput } from '@/components/password-input';
import { useRef, useState, type FormEvent } from 'react';
import type { AuthStatus } from '@/hooks/use-auth';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { BrandMark } from '@/components/brand-mark';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/i18n';

type Props = {
  status: AuthStatus | null;
  error: string;
  onSubmit: (password: string) => Promise<boolean>;
};

/** Criação da conta de administrador e entrada. */
export function AuthPage({ status, error, onSubmit }: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (await onSubmit(password)) setPassword('');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <BrandMark className="text-2xl" />
          <LocaleSwitcher />
        </div>
        <Card>
          {status ? (
            <>
              <CardHeader>
                <h1 className="text-2xl">
                  {status.configured ? t('auth.welcomeBack') : t('auth.createPassword')}
                </h1>
                <CardDescription>
                  {status.configured ? t('auth.signInHint') : t('auth.setupHint')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void submit(e)}>
                  <FieldGroup>
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
                    <FormError>{error}</FormError>
                    <Button type="submit" disabled={busy}>
                      {busy && <Spinner data-icon="inline-start" />}
                      {busy
                        ? t('auth.submitting')
                        : status.configured
                          ? t('auth.signIn')
                          : t('auth.createAccount')}
                    </Button>
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
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
