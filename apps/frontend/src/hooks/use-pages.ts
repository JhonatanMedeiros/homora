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

/** The pages (tabs of the Home) and the changes the manager can make to them. */
export function usePages() {
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
    // Initial load of server data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  /** Runs a change and adopts the pages the server returns; resolves to an error message or null. */
  async function change(url: string, init: RequestInit): Promise<string | null> {
    try {
      const response = await fetch(url, init);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return apiError(body, t('pages.saveFailed'));
      if (Array.isArray(body)) setPages(body as PageRow[]);
      return null;
    } catch {
      return t('pages.saveFailed');
    }
  }

  const add = (name: string) =>
    change('/api/pages', { method: 'POST', headers: json, body: JSON.stringify({ name }) });
  const rename = (id: number, name: string) =>
    change(`/api/pages/${id}`, { method: 'PUT', headers: json, body: JSON.stringify({ name }) });
  const remove = (id: number, moveTo?: number) =>
    change(`/api/pages/${id}${moveTo === undefined ? '' : `?moveTo=${moveTo}`}`, {
      method: 'DELETE',
    });
  const reorder = (ids: number[]) =>
    change('/api/pages/order', { method: 'PUT', headers: json, body: JSON.stringify({ ids }) });

  return { pages, loaded, loadFailed, reload, add, rename, remove, reorder };
}
