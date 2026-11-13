import { useEffect, useState } from 'react';
import type { Source } from '@/features/transfer/transfer-model';

export type ConfigPageOption = { id: number; name: string };

export function useConfigTransferApi() {
  const [pages, setPages] = useState<ConfigPageOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/pages', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) setPages(data as ConfigPageOption[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  function preview(content: string, source: Source) {
    return fetch('/api/config/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, source }),
    });
  }

  function apply(input: {
    content: string;
    source: Source;
    keepPrivate: boolean;
    pageId?: number;
    expectedVersion: number;
  }) {
    return fetch('/api/config/import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  return { pages, preview, apply };
}
