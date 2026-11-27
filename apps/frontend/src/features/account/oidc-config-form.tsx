import { useEffect, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Spinner } from '@homora/ui/spinner';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { OidcAddress } from '@/features/account/oidc-uri';
import { oidcFailed, type OidcAccount, type OidcActions } from '@/hooks/use-oidc';
import { t } from '@/i18n';

/**
 * The redirect URL of an issuer before it is saved: the same hash the server derives the provider
 * id from. Null while the issuer is not an HTTPS URL, or where the browser cannot hash.
 */
function useRedirectUri(issuer: string, origin: string) {
  const [result, setResult] = useState<{ issuer: string; uri: string } | null>(null);
  useEffect(() => {
    if (!/^https:\/\/[^/\s?#]+[^\s?#]*$/i.test(issuer) || !globalThis.crypto?.subtle) return;
    let active = true;
    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(issuer)).then((digest) => {
      const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
      if (active)
        setResult({
          issuer,
          uri: `${origin}/api/auth/callback/oidc-${hex.join('').slice(0, 16)}`,
        });
    });
    return () => {
      active = false;
    };
  }, [issuer, origin]);
  return result?.issuer === issuer ? result.uri : null;
}

/**
 * Creates or changes the provider. It saves a draft while the client ID or secret is missing,
 * which is enough to register the redirect URL at the provider and come back.
 */
export function OidcConfigForm({
  account,
  fromDraft,
  onSave,
  onSaved,
  onCancel,
}: {
  account: OidcAccount;
  /** Starts from the draft instead of the provider in use. */
  fromDraft: boolean;
  onSave: OidcActions['save'];
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const draft = fromDraft ? account.draft : null;
  const initial = draft ?? account.provider;
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [name, setName] = useState(initial?.name ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The issuer the person must confirm, because the linked identity would be removed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const trimmed = issuer.trim();
  // The server only reuses a secret saved here, and only for the same issuer.
  const secretKept =
    (draft?.hasSecret === true && draft.issuer === trimmed) ||
    (account.source === 'saved' && account.provider?.issuer === trimmed);
  const complete = clientId.trim() !== '' && (clientSecret !== '' || secretKept);
  const typedUri = useRedirectUri(trimmed, account.redirectOrigin);
  const redirectUri =
    typedUri ??
    (account.provider?.issuer === trimmed ? account.redirectUri : null) ??
    (account.draft?.issuer === trimmed ? account.draft.redirectUri : null);
  const mustConfirm = confirming === trimmed;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await onSave({
        password,
        issuer: trimmed,
        clientId: clientId.trim(),
        ...(clientSecret ? { clientSecret } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(mustConfirm ? { confirmIssuerChange: true } : {}),
        ...(draft ? { fromDraft: true } : {}),
      });
      if (oidcFailed(result)) {
        if (result.code === 'oidc-confirm-issuer') return setConfirming(trimmed);
        return setError(result.error);
      }
      setPassword('');
      toast.success(t(complete ? 'account.oidcSaved' : 'account.oidcDraftSaved'));
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-label={t('account.oidcConfiguration')}>
      <FieldGroup>
        {account.source === 'environment' && (
          <p className="text-sm text-muted-foreground">{t('account.oidcOverrideHint')}</p>
        )}
        <Field>
          <FieldLabel htmlFor="oidc-issuer">{t('account.oidcIssuer')}</FieldLabel>
          <Input
            id="oidc-issuer"
            type="url"
            required
            maxLength={2048}
            autoComplete="off"
            spellCheck={false}
            value={issuer}
            onChange={(event) => setIssuer(event.target.value)}
          />
          <FieldDescription>{t('account.oidcIssuerHint')}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{t('account.oidcRedirectUri')}</FieldLabel>
          {redirectUri ? (
            <OidcAddress value={redirectUri} />
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {t('account.oidcRedirectUriPending')}
            </p>
          )}
          <FieldDescription>{t('account.oidcRedirectUriHint')}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="oidc-client-id">{t('account.oidcClientId')}</FieldLabel>
          <Input
            id="oidc-client-id"
            maxLength={256}
            autoComplete="off"
            spellCheck={false}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="oidc-client-secret">{t('account.oidcClientSecret')}</FieldLabel>
          <PasswordInput
            id="oidc-client-secret"
            maxLength={1024}
            autoComplete="off"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
          />
          <FieldDescription>
            {t(secretKept ? 'account.oidcSecretKept' : 'account.oidcSecretHint')}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="oidc-name">{t('account.oidcButtonName')}</FieldLabel>
          <Input
            id="oidc-name"
            maxLength={40}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldDescription>{t('account.oidcButtonNameHint')}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="oidc-config-password">{t('account.currentPassword')}</FieldLabel>
          <PasswordInput
            id="oidc-config-password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {mustConfirm && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{t('account.oidcIssuerChange')}</AlertDescription>
          </Alert>
        )}
        <FormError>{error}</FormError>
        <div className="flex flex-wrap justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('account.oidcCancel')}
            </Button>
          )}
          <Button type="submit" variant={mustConfirm ? 'destructive' : 'default'} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {t(
              mustConfirm
                ? 'account.oidcIssuerChangeConfirm'
                : complete
                  ? 'account.oidcSaveAndTest'
                  : 'account.oidcSaveDraft',
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
