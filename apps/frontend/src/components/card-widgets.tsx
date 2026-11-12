import { integrationDefinition } from '@homora/shared';
import { t } from '@/i18n';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { WidgetSkeleton } from '@/components/skeletons';

/** Placeholder rows while loading: the number of stats the definition shows (Proxmox shows five). */
const skeletonStats = (type: string) => {
  const definition = integrationDefinition(type);
  return definition?.kind === 'manifest' ? definition.display.stats.length : 5;
};

/** Integration data within the card, with loading, error, and invalid data states. */
export function CardWidgets({ widgets }: { widgets: CardWidgetState[] }) {
  if (widgets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {widgets.map((entry) => (
        <section
          key={entry.widget.id}
          aria-label={t('cardWidget.region', { name: entry.widget.name })}
          className="rounded-md bg-muted/60 px-3 py-2"
        >
          {entry.status === 'ready' ? (
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
              {entry.stats.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="truncate font-mono text-sm font-medium tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : entry.status === 'loading' ? (
            <WidgetSkeleton
              label={t('cardWidget.loading')}
              count={skeletonStats(entry.widget.type)}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {entry.status === 'invalid' ? t('cardWidget.invalid') : t('cardWidget.error')}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
