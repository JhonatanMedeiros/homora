import { useEffect, useState } from 'react';
import { hasSystemTelemetry } from '@homora/integrations';

export type TelemetryConnectionOption = { id: number; name: string; type: string };

export function useTelemetryConnections() {
  const [connections, setConnections] = useState<TelemetryConnectionOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/connections', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data))
          setConnections(
            data.filter(
              (item) =>
                typeof item?.type === 'string' &&
                hasSystemTelemetry(item.type) &&
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
