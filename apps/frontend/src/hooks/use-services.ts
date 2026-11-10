import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Service } from '@homora/shared';
import { byPosition, isPrivateHost, type ServiceGroup, type ServiceStatus } from '@/lib/services';
import { compareText, t } from '@/i18n';

const collator = compareText;
const json = { 'Content-Type': 'application/json' };

/** Dados da tela de serviços: lista, grupos, disponibilidade e a ordem de ambos. */
export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [groupRows, setGroupRows] = useState<ServiceGroup[]>([]);
  const [statuses, setStatuses] = useState<Record<number, ServiceStatus>>({});
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw Error();
      setServices((await response.json()) as Service[]);
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
          if (active) setStatuses(data);
        })
        .catch(() => {
          // Monitoramento é auxiliar; uma falha não interfere nos serviços.
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

  /** Serviços de rede privada sem autorização: o monitor não os consulta. */
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

  async function moveGroup(category: string, direction: -1 | 1): Promise<string | null> {
    const ordered = [...categories];
    const from = ordered.indexOf(category);
    const to = from + direction;
    if (to < 0 || to >= ordered.length) return null;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    setGroupRows(
      ordered.map((name, position) => ({
        id: groupRows.find((group) => group.name === name)?.id ?? -1,
        name,
        position,
      })),
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

  return {
    services,
    groupRows,
    statuses,
    loadError,
    setLoadError,
    categories,
    sortedIn,
    blockedIds,
    refresh,
    placeService,
    moveGroup,
  };
}
