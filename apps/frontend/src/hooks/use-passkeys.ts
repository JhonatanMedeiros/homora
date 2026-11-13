import { useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { apiError, t, type MessageKey } from '@/i18n';

export type Passkey = {
  id: string;
  name: string | null;
  createdAt: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
};

type Failure = { error: string };
export const failed = (result: unknown): result is Failure =>
  typeof result === 'object' && result !== null && 'error' in result;

export type PasskeyAvailability = 'available' | 'no-browser' | 'wrong-origin';

/**
 * Passkeys need WebAuthn and the exact origin the server was configured for (a secure context:
 * HTTPS or localhost). `origins` comes from the server; without it the answer is unknown, so the
 * feature stays hidden rather than failing later.
 */
export function passkeyAvailability(
  origins: readonly string[] | undefined,
  current: string = window.location.origin,
): PasskeyAvailability {
  if (!browserSupportsWebAuthn()) return 'no-browser';
  return origins?.includes(current) ? 'available' : 'wrong-origin';
}

const post = (path: string, body: object) =>
  fetch(`/api/auth/passkey/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);

/** What went wrong in the browser's passkey prompt, in words the person can act on. */
function ceremonyError(error: unknown, fallback: MessageKey, cancelled: MessageKey): Failure {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
    return { error: t('account.passkeyDuplicate') };
  // Dismissing the prompt, a timeout and "no passkey on this device" all surface as these.
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED')
    return { error: t(cancelled) };
  return { error: t(fallback) };
}

async function failure(response: Response | null, fallback: MessageKey): Promise<Failure> {
  return { error: apiError(await response?.json().catch(() => null), t(fallback)) };
}

/** Signs in with a passkey; the session cookie is set by the response. */
export async function signInWithPasskey(rememberMe: boolean): Promise<true | Failure> {
  const options = await fetch('/api/auth/passkey/generate-authenticate-options').catch(() => null);
  if (!options?.ok) return failure(options, 'auth.passkeyFailed');
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: await options.json() });
  } catch (error) {
    return ceremonyError(error, 'auth.passkeyFailed', 'auth.passkeyCancelled');
  }
  const response = await post('verify-authentication', { response: assertion, rememberMe });
  return response?.ok ? true : failure(response, 'auth.passkeyFailed');
}

/** Calls for the passkey settings; adding and removing ask for the password again. */
export function usePasskeys() {
  return {
    async list(): Promise<Passkey[] | Failure> {
      const response = await fetch('/api/auth/passkey/list-user-passkeys').catch(() => null);
      if (!response?.ok) return failure(response, 'account.passkeyLoadFailed');
      return (await response.json().catch(() => [])) as Passkey[];
    },
    async add(password: string, name: string): Promise<Passkey | Failure> {
      const started = await post('generate-register-options', { password });
      if (!started?.ok) return failure(started, 'account.passkeyFailed');
      let credential;
      try {
        credential = await startRegistration({ optionsJSON: await started.json() });
      } catch (error) {
        return ceremonyError(error, 'account.passkeyUnavailable', 'account.passkeyCancelled');
      }
      const response = await post('verify-registration', {
        response: credential,
        ...(name ? { name } : {}),
      });
      if (!response?.ok) return failure(response, 'account.passkeyFailed');
      return (await response.json()) as Passkey;
    },
    async rename(id: string, name: string): Promise<Passkey | Failure> {
      const response = await post('update-passkey', { id, name });
      if (!response?.ok) return failure(response, 'account.passkeyFailed');
      return (await response.json()) as Passkey;
    },
    async remove(id: string, password: string): Promise<object> {
      const response = await post('delete-passkey', { id, password });
      return response?.ok ? {} : failure(response, 'account.passkeyFailed');
    },
  };
}

/** Origins where the server accepts passkeys, or `undefined` until they are known. */
export function usePasskeyOrigins() {
  const [origins, setOrigins] = useState<string[]>();
  useEffect(() => {
    let active = true;
    fetch('/api/auth/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { passkey?: { origins?: string[] } } | null) => {
        if (active) setOrigins(status?.passkey?.origins ?? []);
      })
      .catch(() => {
        if (active) setOrigins([]);
      });
    return () => {
      active = false;
    };
  }, []);
  return origins;
}
