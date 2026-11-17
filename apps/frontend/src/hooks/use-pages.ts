import { useCallback, useEffect, useState } from 'react';
import { apiError, t } from '@/i18n';

export type PageRow = {
  id: number;
  name: string;
  position: number;
  groups: number;
  widgets?: number;
};

const json = { 'Content-Type': 'application/json' };

async function mutatePages(
  url: string,
  init: RequestInit,
  onPages?: (next: PageRow[]) => void,
): Promise<string | null> {
  try {
    const response = await fetch(url, init);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return apiError(body, t('pages.saveFailed'));
    if (Array.isArray(body)) onPages?.(body as PageRow[]);
    return null;
  } catch {
    return t('pages.saveFailed');
  }
}

export const addPage = (name: string, onPages?: (next: PageRow[]) => void) =>
  mutatePages(
    '/api/pages',
    { method: 'POST', headers: json, body: JSON.stringify({ name }) },
    onPages,
  );

export const renamePage = (id: number, name: string, onPages?: (next: PageRow[]) => void) =>
  mutatePages(
    `/api/pages/${id}`,
    { method: 'PUT', headers: json, body: JSON.stringify({ name }) },
    onPages,
  );

export const removePage = (id: number, moveTo?: number, onPages?: (next: PageRow[]) => void) =>
  mutatePages(
    `/api/pages/${id}${moveTo === undefined ? '' : `?moveTo=${moveTo}`}`,
    { method: 'DELETE' },
    onPages,
  );

export const reorderPages = (ids: number[], onPages?: (next: PageRow[]) => void) =>
  mutatePages(
    '/api/pages/order',
    { method: 'PUT', headers: json, body: JSON.stringify({ ids }) },
    onPages,
  );

/** The pages (tabs of the Home) and the changes the manager can make to them. */
export function usePages(enabled = true) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/pages');
      if (!response.ok) throw Error();
      setPages((await response.json()) as PageRow[]);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Initial load of server data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [enabled, reload]);

  const add = (name: string, onCreated?: (id: number) => void) => {
    const previousIds = new Set(pages.map((page) => page.id));
    return addPage(name, (next) => {
      setPages(next);
      const created = next.find((page) => !previousIds.has(page.id));
      if (created) onCreated?.(created.id);
    });
  };
  const rename = (id: number, name: string) => renamePage(id, name, setPages);
  const remove = (id: number, moveTo?: number) => removePage(id, moveTo, setPages);
  const reorder = (ids: number[]) => reorderPages(ids, setPages);

  return { pages, loaded, loadFailed, reload, add, rename, remove, reorder };
}
