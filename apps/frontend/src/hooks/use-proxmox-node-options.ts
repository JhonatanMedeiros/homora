import { useEffect, useState } from 'react';

/** Loads node names for a Proxmox connection; 'failed' enables the editable text fallback. */
export function useProxmoxNodeOptions(connectionId: number) {
  const [names, setNames] = useState<string[] | 'failed'>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/connections/${connectionId}/guests`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = response.ok ? await response.json() : null;
        const nodes =
          body && typeof body === 'object' ? (body as { nodes?: unknown }).nodes : undefined;
        if (controller.signal.aborted) return;
        if (!Array.isArray(nodes)) return setNames('failed');
        setNames(
          nodes
            .map((node) => (node as { name?: unknown } | null)?.name)
            .filter((name): name is string => typeof name === 'string'),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setNames('failed');
      });
    return () => controller.abort();
  }, [connectionId]);
  return names;
}
