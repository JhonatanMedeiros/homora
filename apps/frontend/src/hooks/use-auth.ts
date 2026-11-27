import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { apiError, t } from '@/i18n';
import { failed, signInWithPasskey } from '@/hooks/use-passkeys';
import { oidcFailed, oidcReturnMessage, signInWithOidc, takeOidcReturn } from '@/hooks/use-oidc';
import { watchSession } from '@/lib/session-guard';
import { clearDraft } from '@/lib/service-draft';

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
  /** The optional OIDC provider; `linked` says an identity can already sign in with it. */
  oidc?:
    | { enabled: false }
    | { enabled: true; name: string; linked: boolean; autoRedirect?: boolean };
};
/** `name` is only needed to create the first account. */
export type Credentials = { email: string; password: string; name?: string; rememberMe?: boolean };

/** Remembers in this browser that the person signed out, until they sign in again. */
const SIGNED_OUT_KEY = 'homora.signed-out';
/** When this tab last left for the provider by itself, so that it can never loop. */
const REDIRECTED_KEY = 'homora.oidc-redirected';
const REDIRECT_PAUSE_MS = 60_000;
const PROBE_KEY = 'homora.storage-probe';

const stored = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch {
    // Storage can be blocked; the sign-in page still works.
    return undefined;
  }
};

/**
 * Whether opening Homora should leave for the provider without being asked. Never after signing
 * out, after a return from the provider, with `?local=1`, or twice within a minute.
 */
function shouldRedirect(status: AuthStatus, returned: boolean) {
  const oidc = status.oidc;
  if (!status.configured || status.authenticated || returned) return false;
  if (!oidc?.enabled || !oidc.autoRedirect) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('local') === '1' || params.has('error')) return false;
  return claimRedirect();
}

/**
 * Notes that this tab is leaving by itself, and says whether it may. Both memories must work:
 * without them nothing would stop a loop or remember a sign-out.
 */
function claimRedirect() {
  const claimed = stored(() => {
    if (localStorage.getItem(SIGNED_OUT_KEY)) return false;
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    const now = Date.now();
    if (now - Number(sessionStorage.getItem(REDIRECTED_KEY) ?? 0) < REDIRECT_PAUSE_MS) return false;
    sessionStorage.setItem(REDIRECTED_KEY, String(now));
    return sessionStorage.getItem(REDIRECTED_KEY) === String(now);
  });
  return claimed === true;
}

/** Access status: checks session, creates admin account, and signs in or out. */
export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');
  // The password was accepted but a code from the authenticator app is still needed.
  const [challenge, setChallenge] = useState(false);

  const [attempt, setAttempt] = useState(0);
  /** The session ended while the app was open (not a sign-out the person asked for). */
  const [expired, setExpired] = useState(false);
  const authenticated = status?.authenticated === true;
  // The provider's redirect back leaves its outcome in the address; read before anything navigates.
  const [returned] = useState(takeOidcReturn);
  /** The provider is being opened by itself; holds its label. */
  const [redirecting, setRedirecting] = useState<string | null>(null);

  useEffect(() => {
    if (authenticated) stored(() => localStorage.removeItem(SIGNED_OUT_KEY));
  }, [authenticated]);

  // Going Back from the provider may restore this page as it was left, still redirecting.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(null);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

  useEffect(() => {
    if (!returned) return;
    if ('linked' in returned) {
      toast.success(t('account.oidcLinkedToast'), { id: 'oidc-return' });
      return;
    }
    const message = oidcReturnMessage(returned);
    // A failed link leaves the person signed in: only the sign-in page keeps the message.
    if (!returned.linking) setError(message);
    toast.error(message, { id: 'oidc-return' });
  }, [returned]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    const expire = () => {
      if (!active) return;
      active = false;
      setExpired(true);
      setStatus((value) => (value ? { ...value, authenticated: false } : value));
    };
    const stop = watchSession(expire);
    // A tab left in the background may have outlived its session: check when it comes back.
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/auth/status')
        .then((response) => (response.ok ? (response.json() as Promise<AuthStatus>) : null))
        .then((value) => {
          if (value && !value.authenticated) expire();
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', recheck);
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [authenticated]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<AuthStatus>;
      })
      .then((value: AuthStatus) => {
        if (!active) return;
        // Only on arrival: a later check (after signing out, or a retry) stays on the page.
        if (attempt === 0 && shouldRedirect(value, returned !== null)) {
          setRedirecting(value.oidc?.enabled ? value.oidc.name : null);
          void signInWithOidc({ auto: true }).then((result) => {
            // The provider does not answer: the sign-in page takes over, without an alarm.
            if (active && oidcFailed(result)) setRedirecting(null);
          });
        }
        setStatus(value);
      })
      .catch(() => {
        if (active) setError(t('auth.serverUnreachable'));
      });
    return () => {
      active = false;
    };
  }, [attempt, returned]);

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
      setExpired(false);
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
      setExpired(false);
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
    setExpired(false);
    setStatus((value) => ({
      ...(value ?? { configured: true }),
      configured: true,
      authenticated: true,
    }));
    return true;
  }

  /** Sends the browser to the OIDC provider; the sign-in completes when it redirects back. */
  async function submitOidc(rememberMe = false) {
    setError('');
    const result = await signInWithOidc({ rememberMe });
    if (oidcFailed(result)) {
      setError(result.error);
      return false;
    }
    return true;
  }

  function cancelChallenge() {
    setChallenge(false);
    setError('');
  }

  async function logout() {
    // A deliberate sign-out leaves nothing typed behind; an expired session keeps it.
    clearDraft();
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error();
      stored(() => localStorage.setItem(SIGNED_OUT_KEY, '1'));
      // Keep what the sign-in page offers (passkeys, provider), then refresh it: the link may
      // have changed while signed in.
      setStatus((value) => ({ ...value, configured: true, authenticated: false }));
      setAttempt((value) => value + 1);
    } catch {
      toast.error(t('auth.logoutFailed'));
    }
  }

  return {
    status,
    error,
    expired,
    challenge,
    redirecting,
    submit,
    submitPasskey,
    submitOidc,
    verifyTwoFactor,
    cancelChallenge,
    logout,
    retry,
  };
}
