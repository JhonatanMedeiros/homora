import { createPresentationCatalog } from '@homora/integrations/frontend/catalog';
import { formatTime, t } from '@/i18n';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import { WidgetSkeleton } from '@/components/skeletons';

const presentations = createPresentationCatalog((key) => key);

/** Integration data within the card, with loading, error, and invalid data states. */
export function CardWidgets({
  widgets,
  layout = 'card',
}: {
  widgets: CardWidgetState[];
  layout?: 'card' | 'list';
}) {
  if (widgets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {widgets.map((entry) => (
        <WidgetErrorBoundary key={entry.widget.id}>
          <section
            aria-label={t('cardWidget.region', { name: entry.widget.name })}
            className={
              layout === 'list'
                ? 'w-full max-w-full'
                : 'w-full max-w-2xl rounded-md bg-muted/60 px-3 py-2'
            }
          >
            {entry.status === 'ready' ? (
              <>
                <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {entry.stats.map((stat) => (
                    <div key={stat.label} className="flex min-w-0 items-baseline gap-1.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{stat.label}</dt>
                      <dd className="min-w-0 truncate font-mono text-sm font-medium tabular-nums">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {entry.stale && (
                  <p role="status" className="mt-1.5 text-xs text-warning">
                    {entry.checkedAt
                      ? t('cardWidget.staleSince', {
                          time: formatTime(Date.parse(entry.checkedAt)),
                        })
                      : t('cardWidget.stale')}
                  </p>
                )}
              </>
            ) : entry.status === 'unconfigured' ? (
              <p className="text-xs text-muted-foreground">{t('cardWidget.unconfigured')}</p>
            ) : entry.status === 'loading' ? (
              <WidgetSkeleton
                label={t('cardWidget.loading')}
                count={presentations.placeholderCount(entry.widget.type)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {entry.status === 'invalid' ? t('cardWidget.invalid') : t('cardWidget.error')}
              </p>
            )}
          </section>
        </WidgetErrorBoundary>
      ))}
    </div>
  );
}
