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
export type OidcProblem = 'unreachable' | 'issuer' | 'endpoints' | 'signing';
export type OidcDraft = {
  issuer: string;
  clientId: string;
  name: string;
  hasSecret: boolean;
  redirectUri: string;
};
/** The sign-in provider as the account sees it; the client secret is never part of it. */
export type OidcAccount = {
  /** A provider is in use: configured and not switched off. */
  enabled: boolean;
  name: string | null;
  /** The address to register at the provider as the redirect (callback) URL. */
  redirectUri: string | null;
  /** The address the provider returns to; set by the server. */
  redirectOrigin: string;
  identity: OidcIdentity | null;
  /** Where the provider comes from. A saved one takes the place of the variables. */
  source: 'saved' | 'environment' | 'none';
  environment: boolean;
  unreadable: boolean;
  provider: { issuer: string; clientId: string; name: string } | null;
  draft: OidcDraft | null;
  disabled: boolean;
  autoRedirect: boolean;
  longSession: boolean;
  health: {
    status: 'unknown' | 'ok' | 'failing';
    failure: OidcProblem | null;
    testedAt: string | null;
  };
};

export type OidcProviderInput = {
  password: string;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  name?: string;
  confirmIssuerChange?: boolean;
  fromDraft?: boolean;
};

/** What the provider's redirect left in the address: a linked identity or a reason it failed. */
export type OidcReturn = { linked: true } | { reason: 'denied' | 'failed'; linking: boolean };

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
        ? // The gateway returns a failed link to the Account page and a failed sign-in elsewhere.
          { reason: error, linking: window.location.pathname === '/account' }
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

/** What to tell the person about a failed return from the provider. */
export function oidcReturnMessage({ reason, linking }: Extract<OidcReturn, { reason: string }>) {
  if (linking) return t(reason === 'denied' ? 'account.oidcLinkDenied' : 'account.oidcLinkRefused');
  return t(reason === 'denied' ? 'auth.oidcDenied' : 'auth.oidcFailed');
}

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

/**
 * Sends the browser to the provider to sign in. `auto` is the redirect nobody asked for: the
 * server then checks that the provider answers and applies its own session length.
 */
export async function signInWithOidc(options: { rememberMe?: boolean; auto?: boolean } = {}) {
  return start(await post('/api/auth/oidc/login', options), 'auth.oidcFailed');
}

/** A refusal, with the server's code so that a confirmation can be asked for. */
export type OidcRefusal = { error: string; code?: string };

/** The sign-in provider of the signed-in account, its identity link and the changes to both. */
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

  /** A change that answers with the new state of the provider. */
  const change = useCallback(async (path: string, body: object): Promise<true | OidcRefusal> => {
    const response = await post(`/api/account/oidc/${path}`, body);
    const result = (await response?.json().catch(() => null)) as
      | (OidcAccount & { code?: string })
      | null;
    if (!response?.ok || !result)
      return { error: apiError(result, t('account.oidcSaveFailed')), code: result?.code };
    setAccount(result);
    return true;
  }, []);

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
    /** Saves the provider, or a draft while the client ID or secret is missing. */
    save: (input: OidcProviderInput) => change('config', input),
    setPreferences: (input: {
      password: string;
      disabled?: boolean;
      autoRedirect?: boolean;
      longSession?: boolean;
    }) => change('preferences', input),
    discardDraft: (password: string) => change('draft/discard', { password }),
    remove: (password: string) => change('remove', { password }),
    test: () => change('test', {}),
  };
}
export type OidcActions = ReturnType<typeof useOidcAccount>;
