import { useEffect, useState } from 'react';
import { t } from '@/i18n';

/** Resolve names locally in the authenticated UI; evidence remains unchanged. */
export function useMonitorNames(enabled: boolean) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch('/api/services', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const value: unknown = await response.json();
        if (!Array.isArray(value)) return {};
        return Object.fromEntries(
          value.flatMap((item: unknown) => {
            if (!item || typeof item !== 'object') return [];
            const row = item as { id?: unknown; name?: unknown };
            return typeof row.id === 'number' &&
              Number.isSafeInteger(row.id) &&
              row.id > 0 &&
              typeof row.name === 'string' &&
              row.name.trim()
              ? [[String(row.id), row.name]]
              : [];
          }),
        );
      })
      .then((result) => {
        if (!controller.signal.aborted) setNames(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNames({});
      });
    return () => controller.abort();
  }, [enabled]);
  return (id: string) => names[id] ?? t('investigation.monitor', { id });
}
