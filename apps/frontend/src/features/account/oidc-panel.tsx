import { useState, type FormEvent, type ReactNode } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Spinner } from '@homora/ui/spinner';
import { Switch } from '@homora/ui/switch';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { OidcConfigForm } from '@/features/account/oidc-config-form';
import { OidcForm } from '@/features/account/oidc-form';
import { OidcAddress } from '@/features/account/oidc-uri';
import { oidcFailed, type OidcAccount, type OidcActions, type OidcRefusal } from '@/hooks/use-oidc';
import { formatDateTime, t } from '@/i18n';

const PROBLEMS = {
  unreachable: 'account.oidcProblemUnreachable',
  issuer: 'account.oidcProblemIssuer',
  endpoints: 'account.oidcProblemEndpoints',
  signing: 'account.oidcProblemSigning',
} as const;

/** An action that only needs the password again, asked for where it was chosen. */
function ConfirmAction({
  description,
  label,
  destructive = false,
  onConfirm,
  onClose,
}: {
  description: string;
  label: string;
  destructive?: boolean;
  onConfirm: (password: string) => Promise<true | OidcRefusal>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await onConfirm(password);
      if (oidcFailed(result)) return setError(result.error);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label={label}
      className="rounded-lg border p-4"
    >
      <FieldGroup>
        <p className="text-sm">{description}</p>
        <Field>
          <FieldLabel htmlFor="oidc-action-password">{t('account.currentPassword')}</FieldLabel>
          <PasswordInput
            id="oidc-action-password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('account.oidcCancel')}
          </Button>
          <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {label}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Whether a sign-in could work now, and why the button is or is not offered. */
function Health({ account, onTest }: { account: OidcAccount; onTest: OidcActions['test'] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { status, failure, testedAt } = account.health;
  const visible = account.enabled && status !== 'failing' && account.identity?.current === true;
  return (
    <Section
      title={t('account.oidcProvider')}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            const result = await onTest();
            if (oidcFailed(result)) setError(result.error);
            setBusy(false);
          }}
        >
          {busy && <Spinner data-icon="inline-start" />}
          {t('account.oidcTestAgain')}
        </Button>
      }
    >
      {failure ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t('account.oidcFailing')}</AlertTitle>
          <AlertDescription>{t(PROBLEMS[failure])}</AlertDescription>
        </Alert>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          {status === 'ok' && <CircleCheck aria-hidden="true" className="size-4 text-success" />}
          {t(status === 'ok' ? 'account.oidcWorking' : 'account.oidcNotTested')}
        </p>
      )}
      {testedAt && (
        <p className="text-xs text-muted-foreground">
          {t('account.oidcTestedAt', { date: formatDateTime(testedAt) })}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {t(visible ? 'account.oidcButtonVisible' : 'account.oidcButtonHidden')}
      </p>
      <FormError>{error}</FormError>
    </Section>
  );
}

/** Automatic redirect and the length of a provider session. */
function Behaviour({
  account,
  onSave,
}: {
  account: OidcAccount;
  onSave: OidcActions['setPreferences'];
}) {
  const [autoRedirect, setAutoRedirect] = useState(account.autoRedirect);
  const [longSession, setLongSession] = useState(account.longSession);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const available =
    account.enabled && account.identity?.current === true && account.health.status !== 'failing';
  const changed = autoRedirect !== account.autoRedirect || longSession !== account.longSession;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await onSave({ password, autoRedirect, longSession });
      if (oidcFailed(result)) return setError(result.error);
      setPassword('');
      toast.success(t('account.oidcSaved'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t('account.oidcBehaviour')}>
      <form onSubmit={(event) => void submit(event)} aria-label={t('account.oidcBehaviour')}>
        <FieldGroup>
          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel htmlFor="oidc-auto">{t('account.oidcAutoRedirect')}</FieldLabel>
              <FieldDescription>
                {t(
                  available || autoRedirect
                    ? 'account.oidcAutoRedirectHint'
                    : 'account.oidcAutoRedirectBlocked',
                )}
              </FieldDescription>
            </div>
            <Switch
              id="oidc-auto"
              checked={autoRedirect}
              // Turning it off is always possible.
              disabled={!available && !autoRedirect}
              onCheckedChange={setAutoRedirect}
            />
          </Field>
          {autoRedirect && (
            <Field>
              <FieldLabel>{t('account.oidcPasswordAddress')}</FieldLabel>
              <OidcAddress value={`${account.redirectOrigin}/login?local=1`} />
              <FieldDescription>{t('account.oidcPasswordAddressHint')}</FieldDescription>
            </Field>
          )}
          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel htmlFor="oidc-long">{t('account.oidcLongSession')}</FieldLabel>
              <FieldDescription>{t('account.oidcLongSessionHint')}</FieldDescription>
            </div>
            <Switch id="oidc-long" checked={longSession} onCheckedChange={setLongSession} />
          </Field>
          {changed && (
            <>
              <Field>
                <FieldLabel htmlFor="oidc-behaviour-password">
                  {t('account.currentPassword')}
                </FieldLabel>
                <PasswordInput
                  id="oidc-behaviour-password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              <FormError>{error}</FormError>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {t('account.oidcSaveBehaviour')}
                </Button>
              </div>
            </>
          )}
        </FieldGroup>
      </form>
    </Section>
  );
}

type Action = 'disable' | 'enable' | 'remove' | 'discard';

/** The sign-in provider in Account: its configuration, its health and the linked identity. */
export function OidcPanel({ oidc, onChanged }: { oidc: OidcActions; onChanged?: () => void }) {
  const account = oidc.account!;
  const [editing, setEditing] = useState<'provider' | 'draft' | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const { provider, draft } = account;
  const showForm = editing !== null || (!provider && !account.unreadable);
  const otherOrigin = window.location.origin !== account.redirectOrigin;

  const actions: Record<
    Action,
    { description: string; label: string; destructive?: boolean; run: OidcActions['remove'] }
  > = {
    disable: {
      description: t('account.oidcDisableHint'),
      label: t('account.oidcDisable'),
      run: (password) => oidc.setPreferences({ password, disabled: true }),
    },
    enable: {
      description: t('account.oidcEnableHint'),
      label: t('account.oidcEnable'),
      run: (password) => oidc.setPreferences({ password, disabled: false }),
    },
    remove: {
      description: t(
        account.environment ? 'account.oidcRemoveHintEnvironment' : 'account.oidcRemoveHint',
      ),
      label: t('account.oidcRemove'),
      destructive: true,
      run: async (password) => {
        const result = await oidc.remove(password);
        if (result === true) onChanged?.();
        return result;
      },
    },
    discard: {
      description: t('account.oidcDiscardHint'),
      label: t('account.oidcDiscard'),
      destructive: true,
      run: oidc.discardDraft,
    },
  };
  const confirm = (name: Action) => (
    <ConfirmAction
      key={name}
      description={actions[name].description}
      label={actions[name].label}
      destructive={actions[name].destructive}
      onConfirm={actions[name].run}
      onClose={() => setAction(null)}
    />
  );

  // `relative` keeps the switches' hidden inputs inside this scroll area: otherwise they stretch
  // the dialog, which then scrolls its own title out of view.
  return (
    <div className="relative flex min-h-0 flex-col gap-6 overflow-y-auto px-1 pb-1">
      <p className="text-sm text-muted-foreground">{t('account.oidcDescription')}</p>
      {account.unreadable && (
        <>
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{t('apiError.oidc-unreadable')}</AlertDescription>
          </Alert>
          {account.source !== 'saved' && (
            <div className="flex flex-col gap-3">
              <div>
                <Button type="button" variant="destructive" onClick={() => setAction('remove')}>
                  {t('account.oidcRemove')}
                </Button>
              </div>
              {action === 'remove' && confirm('remove')}
            </div>
          )}
        </>
      )}
      {account.source === 'environment' && (
        <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t('account.oidcFromEnvironment')}
        </p>
      )}
      {account.source === 'saved' && account.environment && (
        <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t('account.oidcOverridesEnvironment')}
        </p>
      )}
      {otherOrigin && (
        <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t('account.oidcOtherOrigin', { origin: account.redirectOrigin })}
        </p>
      )}
      {draft && editing === null && provider && (
        <Section title={t('account.oidcDraft')}>
          <p className="text-sm">{t('account.oidcDraftPending', { issuer: draft.issuer })}</p>
          <OidcAddress value={draft.redirectUri} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setEditing('draft')}>
              {t('account.oidcCompleteDraft')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAction('discard')}>
              {t('account.oidcDiscard')}
            </Button>
          </div>
          {action === 'discard' && confirm('discard')}
        </Section>
      )}
      {showForm ? (
        <>
          <OidcConfigForm
            key={editing ?? 'new'}
            account={account}
            fromDraft={editing === 'draft' || (editing === null && !provider)}
            onSave={async (input) => {
              const result = await oidc.save(input);
              // A new issuer ends the other sessions.
              if (result === true) onChanged?.();
              return result;
            }}
            onSaved={() => setEditing(null)}
            onCancel={editing === null ? undefined : () => setEditing(null)}
          />
          {!provider && account.identity && (
            // A link outlives its configuration, so it can always be removed.
            <Section title={t('account.oidcIdentity')}>
              <OidcForm
                account={account}
                onLink={oidc.link}
                onUnlink={oidc.unlink}
                onChanged={onChanged}
              />
            </Section>
          )}
          {draft && !provider && (
            <div className="flex flex-col gap-3">
              <div>
                <Button type="button" variant="outline" onClick={() => setAction('discard')}>
                  {t('account.oidcDiscard')}
                </Button>
              </div>
              {action === 'discard' && confirm('discard')}
            </div>
          )}
        </>
      ) : (
        <>
          {provider && !account.disabled && <Health account={account} onTest={oidc.test} />}
          {account.disabled && (
            <p role="status" className="text-sm">
              {t('account.oidcDisabled')}
            </p>
          )}
          {(provider || account.identity) && (
            <Section title={t('account.oidcIdentity')}>
              <OidcForm
                account={account}
                onLink={oidc.link}
                onUnlink={oidc.unlink}
                onChanged={onChanged}
                linkBlocked={
                  account.enabled
                    ? account.health.status === 'failing'
                      ? t('account.oidcLinkNeedsWorking')
                      : undefined
                    : t('account.oidcLinkNeedsEnabled')
                }
              />
            </Section>
          )}
          {provider && (
            <>
              <Behaviour
                key={`${account.autoRedirect}-${account.longSession}`}
                account={account}
                onSave={oidc.setPreferences}
              />
              <Section
                title={t('account.oidcConfiguration')}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing('provider')}
                  >
                    {t('account.oidcEdit')}
                  </Button>
                }
              >
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="text-muted-foreground">{t('account.oidcIssuer')}</dt>
                  <dd className="break-all font-mono text-xs">{provider.issuer}</dd>
                  <dt className="text-muted-foreground">{t('account.oidcClientId')}</dt>
                  <dd className="break-all font-mono text-xs">{provider.clientId}</dd>
                  <dt className="text-muted-foreground">{t('account.oidcClientSecret')}</dt>
                  <dd>{t('account.oidcSecretConfigured')}</dd>
                  <dt className="text-muted-foreground">{t('account.oidcButtonName')}</dt>
                  <dd>{provider.name}</dd>
                </dl>
                {account.redirectUri && (
                  <Field>
                    <FieldLabel>{t('account.oidcRedirectUri')}</FieldLabel>
                    <OidcAddress value={account.redirectUri} />
                  </Field>
                )}
              </Section>
            </>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            {account.source === 'saved' ? (
              <Button type="button" variant="destructive" onClick={() => setAction('remove')}>
                {t('account.oidcRemove')}
              </Button>
            ) : (
              <span />
            )}
            {provider && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(account.disabled ? 'enable' : 'disable')}
              >
                {t(account.disabled ? 'account.oidcEnable' : 'account.oidcDisable')}
              </Button>
            )}
          </div>
          {action && action !== 'discard' && confirm(action)}
        </>
      )}
    </div>
  );
}
