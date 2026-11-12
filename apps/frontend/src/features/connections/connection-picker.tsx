import { integrationDefinitions } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { ConnectionMark } from './connection-mark';
import { labels, type Kind } from './connection-model';
import { t, tOr } from '@/i18n';

type Props = {
  /** Connections already registered, by type. */
  counts: Partial<Record<Kind, number>>;
  onPick: (type: Kind) => void;
  onCancel: () => void;
};

/** First step of adding a connection: pick the type, then fill in its form. */
export function ConnectionPicker({ counts, onPick, onCancel }: Props) {
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
        {integrationDefinitions.map(({ type, capabilities }) => {
          const count = counts[type] ?? 0;
          const description = capabilities
            .map((capability) => tOr(`catalog.${capability}`, capability))
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
