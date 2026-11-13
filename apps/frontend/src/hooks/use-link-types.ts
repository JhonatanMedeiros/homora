import { useCallback, useEffect, useState } from 'react';
import type { LinkColor } from '@homora/shared';
import type { LinkTypeWithUses } from '@/lib/service-links';
import { apiError, t } from '@/i18n';

const json = { 'Content-Type': 'application/json' };

export type LinkTypesApi = {
  types: LinkTypeWithUses[];
  /** Each write resolves to the saved type, or to an error message to show. */
  create: (
    name: string,
    color: LinkColor,
  ) => Promise<{ type: LinkTypeWithUses } | { error: string }>;
  update: (
    id: number,
    patch: { name?: string; color?: LinkColor },
  ) => Promise<{ type: LinkTypeWithUses } | { error: string }>;
  remove: (id: number) => Promise<{ ok: true } | { error: string }>;
};

/**
 * Address types shared by every card (name and color). Loaded while the service form is open.
 * `onChanged` runs after a type was renamed, recolored or deleted, so cards that show it reload.
 */
export function useLinkTypes(enabled: boolean, onChanged?: () => void): LinkTypesApi {
  const [types, setTypes] = useState<LinkTypeWithUses[]>([]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/link-types');
      if (response.ok) setTypes((await response.json()) as LinkTypeWithUses[]);
    } catch {
      /* types are auxiliary: the form still works without them */
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch('/api/link-types')
      .then((response) => (response.ok ? (response.json() as Promise<LinkTypeWithUses[]>) : null))
      .then((data) => {
        if (active && data) setTypes(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);

  const write = useCallback(
    async (
      url: string,
      method: 'POST' | 'PUT' | 'DELETE',
      body?: object,
    ): Promise<{ error: string; data?: undefined } | { error?: undefined; data: unknown }> => {
      try {
        const response = await fetch(url, {
          method,
          headers: body ? json : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) return { error: apiError(data, t('linkType.error')) };
        await reload();
        return { data };
      } catch {
        return { error: t('linkType.error') };
      }
    },
    [reload],
  );

  return {
    types,
    async create(name, color) {
      const result = await write('/api/link-types', 'POST', { name, color });
      return result.error === undefined
        ? { type: result.data as LinkTypeWithUses }
        : { error: result.error };
    },
    async update(id, patch) {
      const result = await write(`/api/link-types/${id}`, 'PUT', patch);
      if (result.error !== undefined) return { error: result.error };
      onChanged?.();
      return { type: { ...(result.data as LinkTypeWithUses), uses: 0 } };
    },
    async remove(id) {
      const result = await write(`/api/link-types/${id}`, 'DELETE');
      if (result.error !== undefined) return { error: result.error };
      onChanged?.();
      return { ok: true };
    },
  };
}
