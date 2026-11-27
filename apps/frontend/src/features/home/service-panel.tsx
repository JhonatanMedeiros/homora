import { Bot } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homora/ui/card';
import { cn } from '@homora/ui/lib/utils';
import { ServiceDetails, type ServiceDetailsProps } from '@/components/service-details';
import type { WindowState } from '@/features/uptime/status-summary';
import { STATE_COLOR, STATE_LABEL, STATE_ORDER } from '@/features/home/states';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import { hostOf } from '@/lib/services';
import type { Service } from '@homora/shared';
import { t } from '@/i18n';

/** Past this, the grid stops growing and says how many more there are. */
const MAX_WINDOWS = 80;

type Props = {
  windows: { id: number; name: string; state: WindowState }[];
  /** The details shown below the grid; null while there is nothing to select. */
  details: (Omit<ServiceDetailsProps, 'service'> & { service: Service }) | null;
  onSelect: (id: number) => void;
  onReviewProposals: () => void;
};

/**
 * The right column of wide screens: one window per service, lit by its state, and the details of
 * the one selected.
 */
export function ServicePanel({ windows, details, onSelect, onReviewProposals }: Props) {
  const pending = usePendingProposals('panel', true);
  // Problems first, so the windows that matter are found without reading them all.
  const ordered = [...windows].sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state),
  );
  return (
    <div data-homora="service-panel" className="flex min-w-0 flex-col gap-4">
      {ordered.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm">
              <h2 className="text-sm">{t('panel.windows')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0">
              {ordered.slice(0, MAX_WINDOWS).map((item) => {
                const label = t('panel.window', {
                  name: item.name,
                  state: t(STATE_LABEL[item.state]),
                });
                const on = details?.service.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-label={label}
                      aria-pressed={on}
                      title={label}
                      className="grid size-7 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:ring-1 aria-pressed:ring-primary pointer-coarse:size-11"
                    >
                      {/* Shape and colour together: the state never rests on colour alone. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'block size-3.5',
                          item.state === 'down'
                            ? 'rounded-full'
                            : item.state === 'unknown'
                              ? 'rounded-sm border-2 border-muted-foreground'
                              : 'rounded-sm',
                          item.state !== 'unknown' && STATE_COLOR[item.state],
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            {ordered.length > MAX_WINDOWS && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('banner.more', { count: ordered.length - MAX_WINDOWS })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <section aria-label={t('panel.label')}>
        <Card className="gap-3">
          {details ? (
            <>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base break-words">{details.service.name}</h2>
                </CardTitle>
                <CardDescription className="font-mono text-xs break-all">
                  {hostOf(details.service.url)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ServiceDetails key={details.service.id} {...details} />
              </CardContent>
            </>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('panel.empty')}</p>
            </CardContent>
          )}
        </Card>
      </section>
      {pending > 0 && (
        <Card className="gap-2">
          <CardContent className="flex flex-col items-start gap-2">
            <p className="flex items-center gap-2 text-sm">
              <Bot aria-hidden="true" className="size-4 shrink-0 text-accent-text" />
              {pending === 1
                ? t('panel.proposals.one')
                : t('panel.proposals.other', { count: pending })}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onReviewProposals}>
              {t('panel.proposals.review')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
