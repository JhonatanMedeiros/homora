import { useCallback, useEffect, useState } from 'react';
import type { Dependency } from '@/features/hosts/dependencies';
import { apiError, t } from '@/i18n';

const json = { 'Content-Type': 'application/json' };

/** Manual dependencies between cards. Writes return an error message, or null on success. */
export function useDependencies() {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/service-dependencies');
      if (response.ok) setDependencies((await response.json()) as Dependency[]);
    } catch {
      /* dependencies are auxiliary: the page keeps working without them */
    }
  }, []);
  useEffect(() => {
    let active = true;
    fetch('/api/service-dependencies')
      .then((response) => (response.ok ? (response.json() as Promise<Dependency[]>) : null))
      .then((data) => {
        if (active && data) setDependencies(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const add = useCallback(
    async (serviceId: number, dependsOnId: number): Promise<string | null> => {
      try {
        const response = await fetch(`/api/services/${serviceId}/dependencies`, {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ dependsOnId }),
        });
        if (!response.ok)
          return apiError(await response.json().catch(() => null), t('dependencies.saveError'));
        await reload();
        return null;
      } catch {
        return t('dependencies.saveError');
      }
    },
    [reload],
  );
  const remove = useCallback(
    async (serviceId: number, dependsOnId: number): Promise<string | null> => {
      try {
        const response = await fetch(`/api/services/${serviceId}/dependencies/${dependsOnId}`, {
          method: 'DELETE',
        });
        if (!response.ok && response.status !== 404) return t('dependencies.saveError');
        await reload();
        return null;
      } catch {
        return t('dependencies.saveError');
      }
    },
    [reload],
  );
  return { dependencies, add, remove, reload };
}
