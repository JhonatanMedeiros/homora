import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';

export function useMonitoringDefaults() {
  const [allowPrivate, setAllowPrivate] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/service-defaults', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ allowPrivate: boolean }>;
      })
      .then((data) => setAllowPrivate(data.allowPrivate === true))
      .catch(() => {
        if (!controller.signal.aborted) setError(t('settings.monitoring.loadError'));
      });
    return () => controller.abort();
  }, []);

  async function change(next: boolean) {
    setError('');
    try {
      const response = await fetch('/api/service-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowPrivate: next }),
      });
      if (!response.ok) throw new Error();
      setAllowPrivate(next);
      toast.success(t('settings.monitoring.saved'));
    } catch {
      setError(t('settings.monitoring.saveError'));
      toast.error(t('settings.monitoring.saveError'));
    }
  }

  return { allowPrivate, error, change };
}
