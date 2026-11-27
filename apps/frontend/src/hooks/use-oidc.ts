import { useCallback, useEffect, useState } from 'react';
import { apiError, t, type MessageKey } from '@/i18n';

/** Leaving for the provider; a seam so tests can observe it without navigating. */
export const navigation = {
  go: (url: string) => window.location.assign(url),
};

type Failure = { error: string };
export const oidcFailed = (result: unknown): result is Failure =>
  typeof result === 'object' && result !== null && 'error' in result;

export type OidcIdentity = {
  createdAt: string;
  /** False once the configured provider changed: the link no longer opens the account. */
  current: boolean;
};
export type OidcAccount = {
  enabled: boolean;
  name: string | null;
  /** The address to register at the provider as the redirect (callback) URL. */
  redirectUri: string | null;
  identity: OidcIdentity | null;
};

/** What the provider's redirect left in the address: a linked identity or a reason it failed. */
export type OidcReturn = { linked: true } | { reason: 'denied' | 'failed' };

let taken: OidcReturn | null | undefined;

/** Forgets what was read, for tests that start the app more than once. */
export function resetOidcReturn() {
  taken = undefined;
}

/**
 * Reads `?oidc=linked` or `?error=denied|failed` once (the gateway reduces whatever the provider
 * said to these words) and removes it from the address bar so a reload never repeats it.
 */
export function takeOidcReturn(): OidcReturn | null {
  if (taken !== undefined) return taken;
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  taken =
    params.get('oidc') === 'linked'
      ? { linked: true }
      : error === 'denied' || error === 'failed'
        ? { reason: error }
        : null;
  if (taken) {
    params.delete('oidc');
    params.delete('error');
    const search = params.toString();
    const { pathname, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${search ? `?${search}` : ''}${hash}`,
    );
  }
  return taken;
}

const REASONS: Record<string, MessageKey> = {
  denied: 'auth.oidcDenied',
  unavailable: 'auth.oidcUnavailable',
  failed: 'auth.oidcFailed',
};
export const oidcReasonMessage = (reason: string) => t(REASONS[reason] ?? 'auth.oidcFailed');

const post = (path: string, body: object) =>
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);

async function start(response: Response | null, fallback: MessageKey): Promise<true | Failure> {
  const body = (await response?.json().catch(() => null)) as { url?: unknown } | null;
  if (response?.ok && typeof body?.url === 'string') {
    // The provider's page takes over; the attempt continues when it redirects back.
    navigation.go(body.url);
    return true;
  }
  return { error: apiError(body, t(fallback)) };
}

/** Sends the browser to the provider to sign in. */
export async function signInWithOidc(rememberMe: boolean) {
  return start(await post('/api/auth/oidc/login', { rememberMe }), 'auth.oidcFailed');
}

/** The OIDC link of the signed-in account, and the two actions that change it. */
export function useOidcAccount() {
  const [account, setAccount] = useState<OidcAccount | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/account/oidc');
      if (!response.ok) throw new Error();
      setAccount((await response.json()) as OidcAccount);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return {
    account,
    loadFailed,
    reload: load,
    /** Asks the provider to confirm the identity; the page leaves on success. */
    link: async (password: string) =>
      start(await post('/api/auth/oidc/link', { password }), 'account.oidcLinkFailed'),
    async unlink(password: string): Promise<true | Failure> {
      const response = await post('/api/account/oidc/unlink', { password });
      if (!response?.ok)
        return {
          error: apiError(await response?.json().catch(() => null), t('account.oidcUnlinkFailed')),
        };
      await load();
      return true;
    },
  };
}
