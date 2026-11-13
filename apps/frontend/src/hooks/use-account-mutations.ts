import { apiError, t } from '@/i18n';
import type { Profile } from '@/features/account/account-model';

export function useAccountMutations() {
  async function saveProfile(name: string): Promise<{ profile?: Profile; error?: string }> {
    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!response?.ok) {
      return {
        error: apiError(await response?.json().catch(() => null), t('account.profileFailed')),
      };
    }
    return { profile: (await response.json()) as Profile };
  }

  async function changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOthers: boolean;
  }): Promise<string | null> {
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).catch(() => null);
    if (response?.ok) return null;
    return apiError(await response?.json().catch(() => null), t('account.passwordFailed'));
  }

  return { saveProfile, changePassword };
}
