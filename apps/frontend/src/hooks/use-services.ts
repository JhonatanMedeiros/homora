import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HostLink, Service } from '@homora/shared';
import { byPosition, isPrivateHost, type ServiceGroup, type ServiceStatus } from '@/lib/services';
import { compareText, t } from '@/i18n';
import type { PageRow } from '@/hooks/use-pages';
import { useServiceOrdering } from '@/hooks/use-service-ordering';

const collator = compareText;
const json = { 'Content-Type': 'application/json' };
const PAGE_KEY = 'homora-page';

function storedPage(): number | null {
  try {
    const value = Number(localStorage.getItem(PAGE_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Services screen data: list, groups, availability, and the ordering of both. */
export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [groupRows, setGroupRows] = useState<ServiceGroup[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [chosenPage, setChosenPage] = useState<number | null>(storedPage);
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
      const pageResponse = await fetch('/api/pages');
      if (pageResponse.ok) setPages((await pageResponse.json()) as PageRow[]);
      setLoadError('');
    } catch {
      setLoadError(t('error.loadServices'));
    }
  }, []);

  async function deleteService(id: number): Promise<boolean> {
    try {
      const response = await fetch(`/api/services/${id}`, { method: 'DELETE' });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function linkHost(id: number, host: HostLink | null): Promise<boolean> {
    try {
      const response = await fetch(`/api/services/${id}/host`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ host }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

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
    fetch('/api/pages')
      .then((response) => (response.ok ? (response.json() as Promise<PageRow[]>) : []))
      .then((data) => {
        if (active) setPages(data);
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

  // The remembered page can be gone (deleted elsewhere): fall back to the first one.
  const activePageId = pages.some((page) => page.id === chosenPage)
    ? (chosenPage as number)
    : (pages[0]?.id ?? 0);
  const selectPage = useCallback((id: number) => {
    setChosenPage(id);
    try {
      localStorage.setItem(PAGE_KEY, String(id));
    } catch {
      /* storage unavailable: the choice lasts until the tab closes */
    }
  }, []);
  /** The page a group is on; a group without a row (cards only) sits on the first page. */
  const pageIdOf = useCallback(
    (category: string) =>
      groupRows.find((group) => group.name === category)?.pageId ?? pages[0]?.id ?? 0,
    [groupRows, pages],
  );

  /** Private network services without authorization: monitor does not poll them. */
  const blockedIds = useMemo(
    () =>
      new Set(
        services.filter((s) => s.allowPrivate !== true && isPrivateHost(s.url)).map((s) => s.id),
      ),
    [services],
  );

  const ordering = useServiceOrdering({
    setServices,
    categories,
    groupRows,
    setGroupRows,
    sortedIn,
    refresh,
  });

  return {
    services,
    loaded,
    groupRows,
    pages,
    activePageId,
    selectPage,
    pageIdOf,
    statuses,
    statusError,
    loadError,
    setLoadError,
    categories,
    sortedIn,
    blockedIds,
    refresh,
    deleteService,
    linkHost,
    ...ordering,
  };
}
