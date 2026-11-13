import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { SectionTitle } from '@/components/section-title';
import {
  failed,
  passkeyAvailability,
  usePasskeyOrigins,
  usePasskeys,
  type Passkey,
} from '@/hooks/use-passkeys';
import { formatDateTime, t } from '@/i18n';

type Stage =
  | { name: 'idle' }
  | { name: 'add' }
  | { name: 'rename'; id: string }
  | { name: 'remove'; id: string };

const label = (passkey: Passkey, index: number) =>
  passkey.name || t('account.passkeyDefaultName', { number: index + 1 });

/**
 * Passkeys for signing in. Adding and removing ask for the password again; the browser then asks
 * for the fingerprint, face or PIN. The feature explains itself when the browser or the address
 * cannot use passkeys instead of failing late.
 */
export function PasskeysForm({
  twoFactorEnabled,
  onChanged,
  onCountChange,
  embedded = false,
  startAdding = false,
}: {
  twoFactorEnabled: boolean;
  /** A passkey was removed; the server ended the other sessions. */
  onChanged?: () => void;
  /** The number of passkeys, once known and after every change. */
  onCountChange?: (count: number) => void;
  /** Inside a dialog that already shows the title. */
  embedded?: boolean;
  /** Opens straight at the add step, for a button that already said so. */
  startAdding?: boolean;
}) {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [stage, setStage] = useState<Stage>(startAdding ? { name: 'add' } : { name: 'idle' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const api = usePasskeys();
  const origins = usePasskeyOrigins();
  const availability = origins ? passkeyAvailability(origins) : null;

  useEffect(() => {
    let active = true;
    void api.list().then((result) => {
      if (!active) return;
      if (failed(result)) setError(result.error);
      else setPasskeys(result);
    });
    return () => {
      active = false;
    };
    // The calls are stable; the list loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = passkeys?.length;
  useEffect(() => {
    if (count !== undefined) onCountChange?.(count);
  }, [count, onCountChange]);

  const reset = (next: Stage = { name: 'idle' }) => {
    setStage(next);
    setName('');
    setPassword('');
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (stage.name === 'idle') return;
    const current = stage;
    void run(async () => {
      if (current.name === 'add') {
        const result = await api.add(password, name.trim());
        if (failed(result)) return setError(result.error);
        setPasskeys((list) => [...(list ?? []), result]);
        reset();
        toast.success(t('account.passkeyAddedToast'));
      } else if (current.name === 'rename') {
        const result = await api.rename(current.id, name.trim());
        if (failed(result)) return setError(result.error);
        setPasskeys((list) => list?.map((item) => (item.id === result.id ? result : item)) ?? null);
        reset();
        toast.success(t('account.passkeyRenamed'));
      } else {
        const result = await api.remove(current.id, password);
        if (failed(result)) return setError(result.error);
        setPasskeys((list) => list?.filter((item) => item.id !== current.id) ?? null);
        reset();
        toast.success(t('account.passkeyRemoved'));
        onChanged?.();
      }
    });
  };

  const target = stage.name === 'rename' || stage.name === 'remove' ? stage.id : null;
  const targetIndex = passkeys?.findIndex((item) => item.id === target) ?? -1;
  const targetName = passkeys && targetIndex >= 0 ? label(passkeys[targetIndex]!, targetIndex) : '';

  return (
    <section
      aria-labelledby={embedded ? undefined : 'account-passkeys'}
      className="flex flex-col gap-4"
    >
      {!embedded && (
        <SectionTitle id="account-passkeys" count={passkeys?.length}>
          {t('account.passkeys')}
        </SectionTitle>
      )}
      <div className="flex max-w-md flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('account.passkeysDescription')}</p>
        {availability === 'no-browser' && (
          <p role="status" className="text-sm">
            {t('account.passkeyNoBrowser')}
          </p>
        )}
        {availability === 'wrong-origin' && (
          <p role="status" className="text-sm">
            {t('account.passkeyWrongOrigin', {
              origins: origins?.join(', ') ?? '',
              current: window.location.origin,
            })}
          </p>
        )}
        {twoFactorEnabled && (
          <p className="text-sm text-muted-foreground">{t('account.passkeysTwoFactorNote')}</p>
        )}

        {passkeys && passkeys.length === 0 && stage.name === 'idle' && (
          <p className="text-sm text-muted-foreground">{t('account.passkeysEmpty')}</p>
        )}
        {passkeys && passkeys.length > 0 && (
          <ItemGroup className="gap-3">
            {passkeys.map((passkey, index) => (
              <Item key={passkey.id} variant="outline" className="bg-card">
                <ItemMedia variant="icon">
                  <KeyRound />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-label text-base">
                    {label(passkey, index)}
                    <Badge variant="secondary">
                      {passkey.backedUp
                        ? t('account.passkeySynced')
                        : t('account.passkeyDeviceOnly')}
                    </Badge>
                  </ItemTitle>
                  {passkey.createdAt && (
                    <ItemDescription className="font-mono text-xs">
                      {t('account.passkeyAdded', { date: formatDateTime(passkey.createdAt) })}
                    </ItemDescription>
                  )}
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => reset({ name: 'rename', id: passkey.id })}
                    aria-label={`${t('account.passkeyRename')}: ${label(passkey, index)}`}
                  >
                    {t('account.passkeyRename')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => reset({ name: 'remove', id: passkey.id })}
                    aria-label={`${t('account.passkeyRemove')}: ${label(passkey, index)}`}
                  >
                    {t('account.passkeyRemove')}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}

        {stage.name === 'idle' && availability === 'available' && (
          <div>
            <Button type="button" variant="outline" onClick={() => reset({ name: 'add' })}>
              {t('account.passkeyAdd')}
            </Button>
          </div>
        )}

        {stage.name !== 'idle' && (
          <form
            onSubmit={submit}
            aria-label={stage.name === 'add' ? t('account.passkeyAdd') : undefined}
          >
            <FieldGroup>
              {stage.name === 'remove' && (
                <p className="font-medium">
                  {t('account.passkeyRemoveTitle', { name: targetName })}
                </p>
              )}
              {stage.name !== 'remove' && (
                <Field>
                  <FieldLabel htmlFor="passkey-name">
                    {stage.name === 'rename'
                      ? t('account.passkeyRenameLabel', { name: targetName })
                      : t('account.passkeyName')}
                  </FieldLabel>
                  <Input
                    id="passkey-name"
                    autoFocus
                    required={stage.name === 'rename'}
                    maxLength={60}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {stage.name === 'add' && (
                    <FieldDescription>{t('account.passkeyNameHint')}</FieldDescription>
                  )}
                </Field>
              )}
              {stage.name !== 'rename' && (
                <Field>
                  <FieldLabel htmlFor="passkey-password">{t('account.currentPassword')}</FieldLabel>
                  <PasswordInput
                    id="passkey-password"
                    required
                    autoFocus={stage.name === 'remove'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <FieldDescription>
                    {stage.name === 'add'
                      ? t('account.passkeyPasswordHint')
                      : t('account.passkeyRemoveHint')}
                  </FieldDescription>
                </Field>
              )}
              {stage.name === 'remove' && passkeys?.length === 1 && (
                <p className="text-sm text-muted-foreground">{t('account.passkeyRemoveLast')}</p>
              )}
              <FormError>{error}</FormError>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant={stage.name === 'remove' ? 'destructive' : 'default'}
                  disabled={busy}
                >
                  {busy && <Spinner data-icon="inline-start" />}
                  {stage.name === 'add'
                    ? t('account.passkeyCreate')
                    : stage.name === 'rename'
                      ? t('account.passkeySave')
                      : t('account.passkeyRemove')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => reset()}>
                  {t('account.passkeyCancel')}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        {stage.name === 'idle' && <FormError>{error}</FormError>}
        <p className="text-sm text-muted-foreground">{t('account.passkeyLost')}</p>
      </div>
    </section>
  );
}
