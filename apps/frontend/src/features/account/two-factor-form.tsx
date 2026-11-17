import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Spinner } from '@homora/ui/spinner';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { QrCode } from '@/components/qr-code';
import { SectionTitle } from '@/components/section-title';
import { failed, useTwoFactor } from '@/hooks/use-two-factor';
import { t } from '@/i18n';

type Stage =
  | { name: 'idle' }
  | { name: 'password'; action: 'enable' | 'disable' | 'regenerate' }
  | { name: 'setup'; uri: string; codes: string[] }
  | { name: 'codes'; codes: string[] };

const secretOf = (uri: string) => new URL(uri).searchParams.get('secret') ?? '';

/**
 * Optional two-step verification with an authenticator app. Turning it on, off or regenerating
 * the recovery codes asks for the password again; the QR code and the codes appear only here.
 */
export function TwoFactorForm({
  enabled,
  onChanged,
  onLockedChange,
  embedded = false,
  startEnabling = false,
}: {
  enabled: boolean;
  /** The state changed; other devices were signed out by the server. */
  onChanged: (enabled: boolean) => void;
  /** True while the QR code or the recovery codes are shown, which appear only once. */
  onLockedChange?: (locked: boolean) => void;
  /** Inside a dialog that already shows the title. */
  embedded?: boolean;
  /** Opens straight at the password step to turn it on, for a button that already said so. */
  startEnabling?: boolean;
}) {
  const [stage, setStage] = useState<Stage>(
    startEnabling && !enabled ? { name: 'password', action: 'enable' } : { name: 'idle' },
  );
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const api = useTwoFactor();
  const locked = stage.name === 'setup' || stage.name === 'codes';
  useEffect(() => {
    onLockedChange?.(locked);
    return () => onLockedChange?.(false);
  }, [locked, onLockedChange]);

  const reset = (next: Stage = { name: 'idle' }) => {
    setStage(next);
    setPassword('');
    setCode('');
    setError('');
  };

  async function run(task: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (stage.name !== 'password') return;
    const { action } = stage;
    void run(async () => {
      if (action === 'enable') {
        const result = await api.start(password);
        if (failed(result)) return setError(result.error);
        reset({ name: 'setup', uri: result.totpURI, codes: result.backupCodes });
      } else if (action === 'regenerate') {
        const result = await api.regenerate(password);
        if (failed(result)) return setError(result.error);
        reset({ name: 'codes', codes: result.backupCodes });
      } else {
        const result = await api.disable(password);
        if (failed(result)) return setError(result.error);
        reset();
        onChanged(false);
        toast.success(t('account.twoFactorDisabled'));
      }
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (stage.name !== 'setup') return;
    const { codes } = stage;
    void run(async () => {
      const result = await api.confirm(code.replace(/\s+/g, ''));
      if (failed(result)) return setError(result.error);
      reset({ name: 'codes', codes });
      onChanged(true);
      toast.success(t('account.twoFactorEnabled'));
    });
  };

  const submitLabel = (action: 'enable' | 'disable' | 'regenerate') =>
    action === 'enable'
      ? t('account.twoFactorContinue')
      : action === 'disable'
        ? t('account.twoFactorDisable')
        : t('account.recoveryRegenerate');

  return (
    <section
      aria-labelledby={embedded ? undefined : 'account-two-factor'}
      className="flex flex-col gap-4"
    >
      {!embedded && (
        <SectionTitle
          id="account-two-factor"
          actions={
            <Badge variant={enabled ? 'default' : 'secondary'}>
              {enabled ? t('account.twoFactorOn') : t('account.twoFactorOff')}
            </Badge>
          }
        >
          {t('account.twoFactor')}
        </SectionTitle>
      )}
      <div className="flex max-w-md flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('account.twoFactorDescription')}</p>

        {stage.name === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => reset({ name: 'password', action: 'regenerate' })}
                >
                  {t('account.recoveryRegenerate')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => reset({ name: 'password', action: 'disable' })}
                >
                  {t('account.twoFactorDisable')}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => reset({ name: 'password', action: 'enable' })}
              >
                {t('account.twoFactorEnable')}
              </Button>
            )}
          </div>
        )}

        {stage.name === 'password' && (
          <form onSubmit={submitPassword}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="two-factor-password">
                  {t('account.currentPassword')}
                </FieldLabel>
                <PasswordInput
                  id="two-factor-password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>
                  {stage.action === 'regenerate'
                    ? t('account.recoveryRegenerateHint')
                    : t('account.twoFactorSignOutNote')}
                </FieldDescription>
              </Field>
              <FormError>{error}</FormError>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant={stage.action === 'disable' ? 'destructive' : 'default'}
                  disabled={busy}
                >
                  {busy && <Spinner data-icon="inline-start" />}
                  {submitLabel(stage.action)}
                </Button>
                <Button type="button" variant="ghost" onClick={() => reset()}>
                  {t('account.twoFactorCancel')}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        {stage.name === 'setup' && (
          <form onSubmit={submitCode}>
            <FieldGroup>
              <p className="text-sm">{t('account.twoFactorScan')}</p>
              <QrCode value={stage.uri} label={t('account.twoFactorQrLabel')} />
              <Field>
                <FieldLabel htmlFor="two-factor-key">{t('account.twoFactorKey')}</FieldLabel>
                <Input
                  id="two-factor-key"
                  readOnly
                  className="font-mono"
                  value={secretOf(stage.uri)}
                  onFocus={(event) => event.target.select()}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="two-factor-setup-code">
                  {t('account.twoFactorCode')}
                </FieldLabel>
                <Input
                  id="two-factor-setup-code"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
              <FormError>{error}</FormError>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {t('account.twoFactorConfirm')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => reset()}>
                  {t('account.twoFactorCancel')}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        {stage.name === 'codes' && (
          <div className="flex flex-col gap-3" role="group" aria-labelledby="recovery-title">
            <h3 id="recovery-title" className="font-medium">
              {t('account.recoveryTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('account.recoveryWarning')}</p>
            <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 font-mono text-sm">
              {stage.codes.map((recovery) => (
                <li key={recovery}>{recovery}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(stage.codes.join('\n'))
                    .then(() => toast.success(t('account.recoveryCopied')))
                    .catch(() => undefined)
                }
              >
                {t('account.recoveryCopy')}
              </Button>
              <Button type="button" onClick={() => reset()}>
                {t('account.recoveryDone')}
              </Button>
            </div>
          </div>
        )}

        {enabled && stage.name === 'idle' && (
          <p className="text-sm text-muted-foreground">{t('account.twoFactorLost')}</p>
        )}
      </div>
    </section>
  );
}
