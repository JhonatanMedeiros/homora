import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import type { PublicState, PublicStatus } from '@/features/public-status/public-status-model';
import { StatusLight } from '@/components/status-light';
import { formatAgo, formatDateTime, formatShortDateTime, t, useI18n } from '@/i18n';
import { formatDuration } from '@/features/uptime/uptime-view';
import type { Availability } from '@/lib/services';
import { cn } from '@homora/ui/lib/utils';
import { PublicStatusSkeleton } from '@/components/skeletons';

export type {
  PublicIncident,
  PublicMaintenance,
  PublicService,
  PublicState,
  PublicStatus,
} from '@/features/public-status/public-status-model';

const REFRESH_MS = 45_000;
const availability: Record<PublicState, Availability> = {
  up: 'available',
  down: 'unavailable',
  unknown: 'unknown',
};
const barClass: Record<PublicState, string> = {
  up: 'bg-success',
  down: 'bg-destructive',
  unknown: 'bg-muted',
};
const barText = {
  up: 'publicStatus.barUp',
  down: 'publicStatus.barDown',
  unknown: 'publicStatus.barUnknown',
} as const;

export function UptimeBars({
  bars,
  label = t('publicStatus.barsLabel'),
  className,
}: {
  bars: PublicState[];
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'flex items-stretch',
        bars.length > 30 ? 'gap-px' : 'gap-0.5',
        className ?? 'h-5',
      )}
    >
      {bars.map((bar, index) => (
        <span
          key={index}
          title={t(barText[bar])}
          className={cn('min-w-0 flex-1 rounded-[2px]', barClass[bar])}
        />
      ))}
    </div>
  );
}

/** Read-only content shared by the public page and the administrator's preview. */
export function PublicStatusView({ data }: { data: PublicStatus }) {
  const categories = [...new Set(data.services.map((service) => service.category))];
  const blind = data.monitoring === 'unavailable';
  const summary = blind
    ? 'publicStatus.monitoringDown'
    : data.services.some((s) => s.status === 'down')
      ? 'publicStatus.someDown'
      : data.services.some((s) => s.status === 'unknown')
        ? 'publicStatus.someUnknown'
        : 'publicStatus.allUp';
  const maintenance = data.maintenance ?? [];
  const incidents = data.incidents ?? [];
  return (
    <div className="flex flex-col gap-8">
      <div role="status" className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-lg font-medium">
          {blind && <CircleHelp aria-hidden="true" className="size-5 text-warning" />}
          {t(summary)}
        </p>
        {blind && (
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t('publicStatus.monitoringDown.detail')}
          </p>
        )}
      </div>
      {maintenance.length > 0 && (
        <section
          aria-label={t(
            maintenance.some((m) => m.active)
              ? 'publicStatus.maint.now'
              : 'publicStatus.maint.next',
          )}
          className="flex flex-col gap-1.5 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm"
        >
          <h2 className="font-medium text-info">
            {t(
              maintenance.some((m) => m.active)
                ? 'publicStatus.maint.now'
                : 'publicStatus.maint.next',
            )}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {maintenance.map((item) => (
              <li key={`${item.name}/${item.startsAt}`}>
                {t('publicStatus.maint.item', {
                  name: item.name,
                  start: formatShortDateTime(item.startsAt),
                  end: formatShortDateTime(item.endsAt),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
      {categories.map((category) => (
        <section key={category} aria-label={category} className="flex flex-col gap-3">
          <h2 className="font-label text-sm tracking-wide text-muted-foreground uppercase">
            {category}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border">
            {data.services
              .filter((service) => service.category === category)
              .map((service) => (
                <li key={`${category}/${service.name}`} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <StatusLight state={availability[service.status]} className="text-base" />
                    <span className="min-w-32 flex-1 font-medium break-words">{service.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {service.checkedAt
                        ? t('publicStatus.checked', { ago: formatAgo(service.checkedAt) })
                        : t('publicStatus.neverChecked')}
                    </span>
                  </div>
                  {service.days && (
                    <>
                      <UptimeBars
                        bars={service.days}
                        label={t('publicStatus.daysLabel')}
                        className="h-8"
                      />
                      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                        <span>{t('publicStatus.days90')}</span>
                        {typeof service.uptime90 === 'number' && (
                          <span className="font-mono tabular-nums">
                            {t('publicStatus.uptime90', { value: service.uptime90 })}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  <UptimeBars bars={service.bars} className={service.days ? 'h-3' : 'h-5'} />
                  {service.uptime !== null && (
                    <p className="text-xs text-muted-foreground">
                      {t('publicStatus.uptime', { value: service.uptime })}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {data.incidents && (
        <section aria-label={t('publicStatus.incidents')} className="flex flex-col gap-3">
          <h2 className="font-label text-sm tracking-wide text-muted-foreground uppercase">
            {t('publicStatus.incidents')}
          </h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('publicStatus.incidents.none')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border text-sm">
              {incidents.map((item) => (
                <li key={`${item.name}/${item.startedAt}`} className="flex items-center gap-3 p-3">
                  <StatusLight
                    state={item.endedAt ? 'available' : 'unavailable'}
                    label={t(
                      item.endedAt
                        ? 'publicStatus.incidents.resolved'
                        : 'publicStatus.incidents.ongoing',
                    )}
                    className="text-base"
                  />
                  <span className="min-w-0 flex-1">
                    {item.endedAt
                      ? t('publicStatus.incidents.closed', {
                          name: item.name,
                          start: formatShortDateTime(item.startedAt),
                          duration: formatDuration(
                            Date.parse(item.endedAt) - Date.parse(item.startedAt),
                          ),
                        })
                      : t('publicStatus.incidents.open', {
                          name: item.name,
                          start: formatShortDateTime(item.startedAt),
                        })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Anonymous page. It must only ever call GET /api/public/status: no session, no
 * /api/auth/* and no other endpoint.
 */
export function StatusPage() {
  const { locale } = useI18n();
  const [data, setData] = useState<PublicStatus | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'closed' | 'gateway' | 'error'>(
    'loading',
  );
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        // Same-origin cookies are sent on purpose: behind an access gateway such as Cloudflare
        // Access, omitting them would break the page even for visitors who already signed in.
        // `manual` lets a gateway redirect be told apart from a plain network failure.
        const response = await fetch('/api/public/status', { redirect: 'manual' });
        if (!active) return;
        if (response.type === 'opaqueredirect') {
          setData(null);
          setState('gateway');
          return;
        }
        if (response.status === 404) {
          setData(null);
          setState('closed');
          return;
        }
        if (!response.ok) throw new Error();
        setData((await response.json()) as PublicStatus);
        setState('ready');
      } catch {
        if (active) setState((current) => (current === 'ready' ? 'ready' : 'error'));
      } finally {
        if (active) timer = setTimeout(() => void load(), REFRESH_MS);
      }
    };
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    document.title = data?.title || t('publicStatus.title');
  }, [data?.title, locale]);
  return (
    <main
      key={locale}
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-10"
    >
      <header>
        <h1 className="text-3xl leading-tight">{data?.title || t('publicStatus.title')}</h1>
        {data?.description && (
          <p className="mt-2 max-w-[65ch] text-muted-foreground">{data.description}</p>
        )}
      </header>
      {state === 'loading' && <PublicStatusSkeleton label={t('publicStatus.loading')} />}
      {state === 'closed' && (
        <p className="text-muted-foreground">{t('publicStatus.unavailable')}</p>
      )}
      {state === 'gateway' && (
        <p role="status" className="text-muted-foreground">
          {t('publicStatus.gateway')}
        </p>
      )}
      {state === 'error' && (
        <p role="status" className="text-muted-foreground">
          {t('publicStatus.error')}
        </p>
      )}
      {state === 'ready' && data && <PublicStatusView data={data} />}
      <footer className="mt-auto text-xs text-muted-foreground">
        {data && <p>{t('publicStatus.updated', { time: formatDateTime(data.updatedAt) })}</p>}
        <p>{t('publicStatus.footer')}</p>
      </footer>
    </main>
  );
}
