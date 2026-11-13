import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { apiError, t } from '@/i18n';
import { failed, signInWithPasskey } from '@/hooks/use-passkeys';

/** "Try again in 40 s" for a rate-limited response, or null when the wait is unknown. */
function throttleMessage(response: Response): string | null {
  if (response.status !== 429) return null;
  const seconds = Math.ceil(Number(response.headers?.get('x-retry-after')));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const wait =
    seconds < 60
      ? t('auth.waitSeconds', { seconds })
      : t('auth.waitMinutes', { minutes: Math.ceil(seconds / 60) });
  return t('auth.tooManyAttempts', { wait });
}

export type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  /** Origins where passkeys work; absent on servers that predate them. */
  passkey?: { origins: string[] };
};
/** `name` is only needed to create the first account. */
export type Credentials = { email: string; password: string; name?: string; rememberMe?: boolean };

/** Access status: checks session, creates admin account, and signs in or out. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');
  // The password was accepted but a code from the authenticator app is still needed.
  const [challenge, setChallenge] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<AuthStatus>;
      })
      .then((value: AuthStatus) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) setError(t('auth.serverUnreachable'));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setError('');
    setAttempt((value) => value + 1);
  }

  async function submit({ name, email, password, rememberMe = false }: Credentials) {
    setError('');
    try {
      if (!status?.configured) {
        const setup = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        if (!setup.ok) throw new Error(t('auth.setupFailed'));
        setStatus({ configured: true, authenticated: false });
      }
      const login = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      if (!login.ok) throw new Error(throttleMessage(login) ?? t('auth.loginFailed'));
      // A successful response is not a session yet when the account asks for a second step.
      const result = await Promise.resolve()
        .then(() => login.json() as Promise<{ twoFactorRedirect?: boolean } | null>)
        .catch(() => null);
      if (result?.twoFactorRedirect === true) {
        setChallenge(true);
        return true;
      }
      setStatus({ configured: true, authenticated: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.connectionFailed');
      setError(message);
      toast.error(message);
      return false;
    }
  }

  /** Answers the second-step challenge with an authenticator code or a recovery code. */
  async function verifyTwoFactor(code: string, recovery: boolean) {
    setError('');
    try {
      const response = await fetch(
        recovery ? '/api/auth/two-factor/verify-backup-code' : '/api/auth/two-factor/verify-totp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
        // An expired or exhausted challenge cannot be retried: start again from the password.
        if (body?.code === 'two-factor-challenge-expired') setChallenge(false);
        throw new Error(throttleMessage(response) ?? apiError(body, t('auth.twoFactorFailed')));
      }
      setChallenge(false);
      setStatus({ configured: true, authenticated: true });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.connectionFailed');
      setError(message);
      return false;
    }
  }

  /** Signs in with a passkey. A verified passkey is a complete sign-in: no second step follows. */
  async function submitPasskey(rememberMe: boolean) {
    setError('');
    const result = await signInWithPasskey(rememberMe);
    if (failed(result)) {
      setError(result.error);
      return false;
    }
    setStatus((value) => ({
      ...(value ?? { configured: true }),
      configured: true,
      authenticated: true,
    }));
    return true;
  }

  function cancelChallenge() {
    setChallenge(false);
    setError('');
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error();
      setStatus({ configured: true, authenticated: false });
    } catch {
      toast.error(t('auth.logoutFailed'));
    }
  }

  return {
    status,
    error,
    challenge,
    submit,
    submitPasskey,
    verifyTwoFactor,
    cancelChallenge,
    logout,
    retry,
  };
}
