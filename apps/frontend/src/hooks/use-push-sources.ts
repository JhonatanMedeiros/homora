import { toast } from 'sonner';
import { useCallback, useEffect, useState } from 'react';
import { apiError, t } from '@/i18n';
import type { Plan } from '@/features/transfer/transfer-model';
import type { PushSource, SourceChange } from '@/features/discovery/push-source-model';
import type { Skipped } from '@/features/discovery/local-discovery-model';
import type { AddressNote } from '@/features/discovery/review-model';
import { useDiscoveryReview } from '@/hooks/use-discovery-review';

type Preview = {
  source: { id: string; version: number };
  version: number;
  entries: { id: string; container: string; note?: AddressNote }[];
  skipped?: Skipped[];
  skippedTotal?: number;
  plan: Plan;
};

/** Loads remote discovery state and coordinates reviewable source/inventory actions. */
export function usePushSources(onImported: () => void | Promise<void>) {
  const [sources, setSources] = useState<PushSource[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ source: PushSource; action: SourceChange } | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/discovery/sources');
    if (!response.ok) throw new Error();
    const data = await response.json();
    setSources(Array.isArray(data.sources) ? data.sources : []);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/discovery/sources', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setSources(Array.isArray(data.sources) ? data.sources : []))
      .catch(() => {
        if (!controller.signal.aborted) setError(t('push.failed'));
      });
    return () => controller.abort();
  }, []);

  async function call(path: string, method: string, body?: object) {
    const response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw new Error(apiError(data, t('push.failed')));
    }
    return response.status === 204 ? null : response.json();
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t('push.failed');
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function change(source: PushSource, actionName: SourceChange) {
    await run(async () => {
      if (actionName === 'rotate') {
        const data = await call(`/api/discovery/sources/${source.id}/rotate`, 'POST');
        setToken({ name: source.name, value: data.token });
      } else if (actionName === 'revoke') {
        await call(`/api/discovery/sources/${source.id}/revoke`, 'POST');
      } else {
        await call(`/api/discovery/sources/${source.id}`, 'DELETE');
      }
      setConfirm(null);
      setPreview(null);
      await load();
    });
  }

  async function review(source: PushSource) {
    await run(async () => {
      setPreview(await call(`/api/discovery/sources/${source.id}/suggestions`, 'GET'));
      setSelected(new Set());
    });
  }

  async function createSource() {
    await run(async () => {
      const data = await call('/api/discovery/sources', 'POST', { name });
      setToken({ name, value: data.token });
      setName('');
      setAdding(false);
      await load();
    });
  }

  const reviewing = useDiscoveryReview({
    endpoint: preview ? `/api/discovery/sources/${preview.source.id}/import` : '',
    extra: preview ? { inventoryVersion: preview.source.version } : {},
    onDone: async () => {
      setPreview(null);
      setSelected(new Set());
      await onImported();
      await load();
    },
  });

  const previewName = preview
    ? sources.find((source) => source.id === preview.source.id)?.name
    : '';
  const items = preview
    ? preview.plan.services.map((service, index) => {
        const entry = preview.entries[index];
        return {
          id: entry?.id,
          name: service.name,
          group: service.group,
          url: service.url,
          container: entry?.container,
          note: entry?.note,
          isNew: service.status === 'new',
        };
      })
    : [];

  function startReview() {
    reviewing.open(
      items.flatMap((item) => (item.id && selected.has(item.id) ? [{ ...item, id: item.id }] : [])),
    );
  }

  return {
    sources,
    adding,
    setAdding,
    name,
    setName,
    token,
    setToken,
    error,
    busy,
    preview,
    setPreview,
    selected,
    setSelected,
    confirm,
    setConfirm,
    message,
    load,
    run,
    change,
    review,
    createSource,
    reviewing,
    startReview,
    previewName,
    items,
  };
}
