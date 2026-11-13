import { apiError, t } from '@/i18n';

type Failure = { error: string };

/** Calls for the two-step verification settings; every one asks for the password again. */
export function useTwoFactor() {
  async function post<T>(path: string, body: object): Promise<T | Failure> {
    const response = await fetch(`/api/auth/two-factor/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok)
      return {
        error: apiError(await response?.json().catch(() => null), t('account.twoFactorFailed')),
      };
    return (await response.json().catch(() => ({}))) as T;
  }

  return {
    /** Starts the setup: the secret URI and recovery codes are shown only now, once. */
    start: (password: string) =>
      post<{ totpURI: string; backupCodes: string[] }>('enable', { password }),
    /** Proves the app works; only then is the second step turned on. */
    confirm: (code: string) => post<object>('verify-totp', { code }),
    disable: (password: string) => post<object>('disable', { password }),
    regenerate: (password: string) =>
      post<{ backupCodes: string[] }>('generate-backup-codes', { password }),
  };
}

export const failed = (result: object): result is Failure => 'error' in result;
