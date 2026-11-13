import { useCallback, useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { AccountSession } from '@/features/account/account-model';

export function useAccountSessions(refreshKey: number) {
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/account/sessions').catch(() => null);
    if (!response?.ok) {
      setError(t('account.sessionsFailed'));
      return;
    }
    setSessions((await response.json()) as AccountSession[]);
    setError('');
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data from the server
    void load();
  }, [load, refreshKey]);

  const revoke = useCallback(
    async (url: string) => {
      const response = await fetch(url, { method: 'POST' }).catch(() => null);
      await load();
      return response;
    },
    [load],
  );

  return { sessions, error, load, revoke };
}
