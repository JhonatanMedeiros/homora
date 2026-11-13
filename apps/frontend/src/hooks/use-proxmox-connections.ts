import { useEffect, useState } from 'react';

export type ProxmoxConnectionOption = { id: number; name: string; type: string };

export function useProxmoxConnections() {
  const [connections, setConnections] = useState<ProxmoxConnectionOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/connections', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data))
          setConnections(
            data.filter(
              (item) =>
                item?.type === 'proxmox' &&
                Number.isSafeInteger(item.id) &&
                typeof item.name === 'string',
            ),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return connections;
}
