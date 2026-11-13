import { integrationDefinitions } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { ConnectionMark } from './connection-mark';
import { labels, type Kind } from './connection-model';
import { t, tOr } from '@/i18n';

type Props = {
  /** Connections already registered, by type. */
  counts: Partial<Record<Kind, number>>;
  onPick: (type: Kind) => void;
};

/** First step of adding a connection: pick the type, then fill in its form. */
export function ConnectionPicker({ counts, onPick }: Props) {
  return (
    <section aria-label={t('connections.pickTitle')} className="flex flex-col gap-3">
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
