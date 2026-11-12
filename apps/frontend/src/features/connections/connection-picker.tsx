import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConnectionMark } from './connection-mark';
import { labels, type Kind } from './connection-model';
import { t, type MessageKey } from '@/i18n';

type Props = {
  /** Connections already registered, by type. */
  counts: Partial<Record<Kind, number>>;
  onPick: (type: Kind) => void;
  onCancel: () => void;
};

const known = new Set(['inventory', 'server-info', 'entity-state', 'status-page', 'dns-status']);

/** What each type reads, from the server catalog. Missing data only hides the description. */
function useCapabilities() {
  const [byType, setByType] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/integrations/catalog', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!Array.isArray(data) || controller.signal.aborted) return;
        const next: Record<string, string[]> = {};
        for (const entry of data as { type?: unknown; capabilities?: unknown }[]) {
          if (typeof entry?.type === 'string' && Array.isArray(entry.capabilities))
            next[entry.type] = entry.capabilities.filter(
              (item): item is string => typeof item === 'string' && known.has(item),
            );
        }
        setByType(next);
      })
      .catch(() => {
        // The picker works from the known types even without the catalog.
      });
    return () => controller.abort();
  }, []);
  return byType;
}

/** First step of adding a connection: pick the type, then fill in its form. */
export function ConnectionPicker({ counts, onPick, onCancel }: Props) {
  const capabilities = useCapabilities();
  return (
    <section aria-labelledby="connection-picker-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="connection-picker-title" className="text-lg font-semibold">
            {t('connections.pickTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('connections.pickHint')}</p>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {(Object.keys(labels) as Kind[]).map((type) => {
          const count = counts[type] ?? 0;
          const description = (capabilities[type] ?? [])
            .map((capability) => t(`catalog.${capability}` as MessageKey))
            .join(', ');
          return (
            <li key={type}>
              <Button
                type="button"
                variant="outline"
                onClick={() => onPick(type)}
                className="h-auto w-full justify-start gap-3 p-3 text-left"
              >
                <ConnectionMark type={type} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{labels[type]}</span>
                  {description && (
                    <span className="text-sm text-muted-foreground">{description}</span>
                  )}
                </span>
                {count > 0 && (
                  <span className="shrink-0 rounded-md border px-1.5 py-1 font-mono text-xs text-muted-foreground">
                    {t('connections.connectedCount', { count })}
                  </span>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
