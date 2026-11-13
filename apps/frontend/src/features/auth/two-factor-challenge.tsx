import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { FormError } from '@/components/form-error';
import { t } from '@/i18n';

type Props = {
  error: string;
  onVerify: (code: string, recovery: boolean) => Promise<boolean>;
  onCancel: () => void;
};

/** Second step of the sign-in: a code from the authenticator app, or a one-time recovery code. */
export function TwoFactorChallenge({ error, onVerify, onCancel }: Props) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (!(await onVerify(code.replace(/\s+/g, ''), recovery))) setCode('');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <CardHeader>
        <h1 className="text-2xl">{t('auth.twoFactorTitle')}</h1>
        <CardDescription>
          {recovery ? t('auth.recoveryHint') : t('auth.twoFactorHint')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="two-factor-code">
                {recovery ? t('auth.recoveryCode') : t('auth.twoFactorCode')}
              </FieldLabel>
              <Input
                key={recovery ? 'recovery' : 'totp'}
                id="two-factor-code"
                autoFocus
                required
                autoComplete="one-time-code"
                inputMode={recovery ? 'text' : 'numeric'}
                maxLength={recovery ? 16 : 8}
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <FormError>{error}</FormError>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? t('auth.submitting') : t('auth.verify')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRecovery((value) => !value);
                setCode('');
              }}
            >
              {recovery ? t('auth.useAuthenticator') : t('auth.useRecoveryCode')}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('auth.backToSignIn')}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </>
  );
}
