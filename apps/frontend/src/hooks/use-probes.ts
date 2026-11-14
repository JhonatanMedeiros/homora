import { useCallback, useEffect, useState } from 'react';
import type { Probe, ProbeInput } from '@homora/shared';
import { apiError, t } from '@/i18n';
import type { ServiceStatus } from '@/lib/services';

const json = { 'Content-Type': 'application/json' };

/** The stored probes; `null` until the first answer. The Home only needs this much. */
export function useProbeList() {
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/probes');
      if (!response.ok) throw new Error();
      setProbes((await response.json()) as Probe[]);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/probes')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Probe[]>;
      })
      .then((data) => {
        if (active) setProbes(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { probes, failed, refresh };
}

/** Probes screen data: the list, what each one is doing right now, and the writes. */
export function useProbes() {
  const { probes, failed, refresh } = useProbeList();
  const [statuses, setStatuses] = useState<Record<number, ServiceStatus>>({});

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/service-status')
        .then((response) =>
          response.ok ? (response.json() as Promise<Record<number, ServiceStatus>>) : null,
        )
        .then((data) => {
          if (active && data) setStatuses(data);
        })
        // Status is auxiliary: a probe without it simply reads "unknown".
        .catch(() => {});
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  /** Saves a probe and, when it is new, resolves with it; throws a readable message on failure. */
  async function save(id: number | null, input: ProbeInput, isPublic: boolean): Promise<void> {
    const response = await fetch(id === null ? '/api/probes' : `/api/probes/${id}`, {
      method: id === null ? 'POST' : 'PUT',
      headers: json,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(apiError(body, t('probes.saveFailed')));
    }
    const saved = (await response.json()) as Probe;
    const current =
      id === null ? false : (probes?.find((probe) => probe.id === id)?.isPublic ?? false);
    if (isPublic !== current) {
      const shared = await fetch(`/api/services/${saved.id}/public`, {
        method: 'PUT',
        headers: json,
        body: JSON.stringify({ isPublic }),
      });
      if (!shared.ok) throw new Error(t('probes.saveFailed'));
    }
    await refresh();
  }

  async function remove(id: number): Promise<boolean> {
    try {
      const response = await fetch(`/api/probes/${id}`, { method: 'DELETE' });
      if (!response.ok) return false;
      await refresh();
      return true;
    } catch {
      return false;
    }
  }

  return { probes, statuses, failed, save, remove };
}
