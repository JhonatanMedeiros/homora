import { useEffect, useState } from 'react';
import { t } from '@/i18n';

export type AuthStatus = { configured: boolean; authenticated: boolean };
/** `name` is only needed to create the first account. */
export type Credentials = { email: string; password: string; name?: string };

/** Access status: checks session, creates admin account, and signs in or out. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');

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

  async function submit({ name, email, password }: Credentials) {
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
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(t('auth.loginFailed'));
      setStatus({ configured: true, authenticated: true });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.connectionFailed'));
      return false;
    }
  }

  async function logout() {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    setStatus({ configured: true, authenticated: false });
  }

  return { status, error, submit, logout, retry };
}
