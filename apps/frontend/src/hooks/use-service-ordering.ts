import type { Dispatch, SetStateAction } from 'react';
import type { Service } from '@homora/shared';
import type { ServiceGroup } from '@/lib/services';
import { t } from '@/i18n';

const json = { 'Content-Type': 'application/json' };

type Options = {
  setServices: Dispatch<SetStateAction<Service[]>>;
  categories: string[];
  groupRows: ServiceGroup[];
  setGroupRows: Dispatch<SetStateAction<ServiceGroup[]>>;
  sortedIn: (category: string) => Service[];
  refresh: () => Promise<void>;
};

/** Optimistic ordering and movement actions for service cards and groups. */
export function useServiceOrdering({
  setServices,
  categories,
  groupRows,
  setGroupRows,
  sortedIn,
  refresh,
}: Options) {
  async function placeService(service: Service, to: number): Promise<string | null> {
    const ordered = sortedIn(service.category);
    const from = ordered.findIndex((item) => item.id === service.id);
    if (from < 0 || to < 0 || to >= ordered.length || to === from) return null;
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    setServices((items) =>
      items.map((item) => {
        const index = ordered.findIndex((entry) => entry.id === item.id);
        return index < 0 ? item : { ...item, position: index };
      }),
    );
    try {
      const response = await fetch('/api/services/order', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ category: service.category, ids: ordered.map((item) => item.id) }),
      });
      if (!response.ok) throw Error();
      return null;
    } catch {
      void refresh();
      return t('error.saveCardOrder');
    }
  }

  /** Moves a service to another group, appended at the end (same endpoint as editing it). */
  async function moveServiceToGroup(service: Service, category: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/services/${service.id}`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({
          name: service.name,
          url: service.url,
          category,
          description: service.description,
          icon: service.icon ?? '',
          position: service.position ?? 0,
          allowPrivate: service.allowPrivate === true,
          checkType: service.checkType ?? 'http',
          checkInterval: service.checkInterval ?? null,
          expectedStatus: service.expectedStatus ?? null,
          checkPath: service.checkPath ?? null,
        }),
      });
      if (!response.ok) throw Error();
      await refresh();
      return null;
    } catch {
      return t('error.moveService');
    }
  }

  /**
   * Undoes a group move and restores that group's previous order (`ids`, captured before the move,
   * includes the service).
   */
  async function restoreService(service: Service, ids: number[]): Promise<string | null> {
    const failure = await moveServiceToGroup(service, service.category);
    if (failure) return failure;
    try {
      const response = await fetch('/api/services/order', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ category: service.category, ids }),
      });
      if (!response.ok) throw Error();
      await refresh();
      return null;
    } catch {
      void refresh();
      return t('error.saveCardOrder');
    }
  }

  async function moveGroup(category: string, direction: -1 | 1): Promise<string | null> {
    const ordered = [...categories];
    const from = ordered.indexOf(category);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return null;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    setGroupRows(
      ordered.map((name, position) => {
        const row = groupRows.find((group) => group.name === name);
        return {
          id: row?.id ?? -1,
          name,
          position,
          pageId: row?.pageId,
          columns: row?.columns ?? null,
        };
      }),
    );
    try {
      const response = await fetch('/api/groups/order', {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ names: ordered }),
      });
      if (!response.ok) throw Error();
      return null;
    } catch {
      void refresh();
      return t('error.saveGroupOrder');
    }
  }

  /** Puts a group on another page. */
  async function moveGroupToPage(id: number, pageId: number): Promise<string | null> {
    try {
      const response = await fetch(`/api/groups/${id}/page`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ pageId }),
      });
      if (!response.ok) throw Error();
      await refresh();
      return null;
    } catch {
      return t('error.moveGroupPage');
    }
  }

  async function setGroupColumns(id: number, columns: number | null): Promise<string | null> {
    const before = groupRows;
    setGroupRows((rows) => rows.map((row) => (row.id === id ? { ...row, columns } : row)));
    try {
      const response = await fetch(`/api/groups/${id}/columns`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ columns }),
      });
      if (!response.ok) throw Error();
      return null;
    } catch {
      setGroupRows(before);
      return t('error.saveColumns');
    }
  }

  return {
    placeService,
    moveServiceToGroup,
    restoreService,
    moveGroup,
    moveGroupToPage,
    setGroupColumns,
  };
}
