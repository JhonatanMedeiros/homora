import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { FormError } from '@/components/form-error';
import { SectionTitle } from '@/components/section-title';
import {
  eventTitleKey,
  type ActivityEvent,
  type ActivityPage,
} from '@/features/activity/activity-model';
import { formatAgo, formatDateTime, t } from '@/i18n';
import { cn } from '@/lib/utils';

const SHOWN = 5;
const DAY = 24 * 60 * 60 * 1000;

/** Failed sign-in attempts in the last 24 hours. */
const recentFailures = (events: ActivityEvent[], now = Date.now()) =>
  events.filter(
    (event) =>
      event.action === 'login' && event.outcome !== 'success' && now - event.createdAt < DAY,
  ).length;

/** The latest sign-ins to this account, so an unfamiliar one is noticed. */
export function SignInActivity({ refreshKey = 0 }: { refreshKey?: number }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/activity?kind=access&limit=50')
      .then((response) => (response.ok ? (response.json() as Promise<ActivityPage>) : null))
      .then((page) => (page && Array.isArray(page.events) ? page : null))
      .catch(() => null)
      .then((page) => {
        if (!active) return;
        setFailed(!page);
        if (page) setEvents(page.events);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const failures = events ? recentFailures(events) : 0;

  return (
    <section aria-labelledby="account-sign-ins" className="flex flex-col gap-4">
      <SectionTitle
        id="account-sign-ins"
        actions={
          failures > 0 && (
            <Badge variant="warning">{t('account.signInsFailed', { count: failures })}</Badge>
          )
        }
      >
        {t('account.signIns')}
      </SectionTitle>
      {failed && <FormError>{t('account.signInsLoadFailed')}</FormError>}
      {events && events.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('account.signInsEmpty')}</p>
      )}
      {events && events.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {events.slice(0, SHOWN).map((event) => (
            <li key={event.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  event.outcome === 'success' ? 'bg-success' : 'bg-destructive',
                )}
              />
              <span className="min-w-0 flex-1 truncate">{t(eventTitleKey(event))}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {event.ipAddress && `${event.ipAddress} · `}
                <time
                  dateTime={new Date(event.createdAt).toISOString()}
                  title={formatDateTime(event.createdAt)}
                >
                  {formatAgo(event.createdAt)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/manage/activity" className="w-fit text-sm underline-offset-4 hover:underline">
        {t('account.signInsAll')}
      </Link>
    </section>
  );
}
