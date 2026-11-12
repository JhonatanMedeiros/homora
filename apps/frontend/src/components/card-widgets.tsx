import { t } from '@/i18n';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { WidgetSkeleton } from '@/components/skeletons';

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
            <dl className="flex flex-wrap gap-x-4 gap-y-1">
              {entry.stats.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col">
                  <dd className="truncate font-mono text-sm font-medium">{stat.value}</dd>
                  <dt className="font-mono text-[0.6875rem] text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          ) : entry.status === 'loading' ? (
            <WidgetSkeleton label={t('cardWidget.loading')} />
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
