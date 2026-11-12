import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Service } from '@homora/shared';
import { byPosition, isPrivateHost, type ServiceGroup, type ServiceStatus } from '@/lib/services';
import { compareText, t } from '@/i18n';

const collator = compareText;
const json = { 'Content-Type': 'application/json' };

/** Services screen data: list, groups, availability, and the ordering of both. */
export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [groupRows, setGroupRows] = useState<ServiceGroup[]>([]);
  const [statuses, setStatuses] = useState<Record<number, ServiceStatus>>({});
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [statusError, setStatusError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw Error();
      setServices((await response.json()) as Service[]);
      setLoaded(true);
      const groupResponse = await fetch('/api/groups');
      if (groupResponse.ok) setGroupRows((await groupResponse.json()) as ServiceGroup[]);
      setLoadError('');
    } catch {
      setLoadError(t('error.loadServices'));
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/services')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Service[]>;
      })
      .then((data) => {
        if (active) {
          setServices(data);
          setLoaded(true);
          setLoadError('');
        }
      })
      .catch(() => {
        if (active) setLoadError(t('error.loadServices'));
      });
    fetch('/api/groups')
      .then((response) => (response.ok ? (response.json() as Promise<ServiceGroup[]>) : []))
      .then((data) => {
        if (active) setGroupRows(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshStatuses = () =>
      fetch('/api/service-status')
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<Record<number, ServiceStatus>>;
        })
        .then((data) => {
          if (active) {
            setStatuses(data);
            setStatusError(false);
          }
        })
        .catch(() => {
          // Monitoring is auxiliary and does not block services; the page only notes the lag.
          if (active) setStatusError(true);
        });
    void refreshStatuses();
    const timer = window.setInterval(() => void refreshStatuses(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const groupPosition = useCallback(
    (name: string) => groupRows.find((group) => group.name === name)?.position ?? 9999,
    [groupRows],
  );
  const categories = useMemo(
    () =>
      [...new Set([...groupRows.map((g) => g.name), ...services.map((s) => s.category)])].sort(
        (a, b) => groupPosition(a) - groupPosition(b) || collator(a, b),
      ),
    [services, groupRows, groupPosition],
  );
  const sortedIn = useCallback(
    (category: string) =>
      services
        .filter((item) => item.category === category)
        .sort((a, b) => byPosition(a, b) || collator(a.name, b.name)),
    [services],
  );

  /** Private network services without authorization: monitor does not poll them. */
  const blockedIds = useMemo(
    () =>
      new Set(
        services.filter((s) => s.allowPrivate !== true && isPrivateHost(s.url)).map((s) => s.id),
      ),
    [services],
  );

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
   * Undoes moveServiceToGroup: puts the service back in its original group and restores that group's
   * previous order (`ids`, captured before the move, includes the service).
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
        return { id: row?.id ?? -1, name, position, columns: row?.columns ?? null };
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
    services,
    loaded,
    groupRows,
    statuses,
    statusError,
    loadError,
    setLoadError,
    categories,
    sortedIn,
    blockedIds,
    refresh,
    placeService,
    moveServiceToGroup,
    restoreService,
    moveGroup,
    setGroupColumns,
  };
}
