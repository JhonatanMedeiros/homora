import { Fragment } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { StatusLight } from '@/components/status-light';
import { SectionTitle } from '@/components/section-title';
import { getLocale, t } from '@/i18n';
import { eventTitleKey, groupByDay, type ActivityEvent } from './activity-model';

const time = (value: number) =>
  new Intl.DateTimeFormat(getLocale(), { timeStyle: 'short' }).format(new Date(value));

function actorName(event: ActivityEvent) {
  if (event.actor.type === 'anonymous') return t('activity.actorAnonymous');
  if (event.actor.name) return event.actor.name;
  return event.actor.type === 'agent'
    ? t('activity.actorAgentUnknown')
    : t('activity.actorUnknown');
}

/** Context line. A failed sign-in only has an address and an attempt count. */
function detailLine(event: ActivityEvent) {
  if (event.action === 'login' && event.outcome === 'failure') {
    const count = Number(event.detail);
    return [
      event.ipAddress,
      Number.isInteger(count) && count > 0 ? t('activity.attempts', { count }) : null,
    ];
  }
  if (event.action === 'password-change' && event.detail === 'revoked-others')
    return [t('activity.revokedOthers'), event.ipAddress];
  return [event.detail, event.ipAddress];
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const dayLabel = (label: 'today' | 'yesterday' | Date) =>
    label === 'today'
      ? t('activity.today')
      : label === 'yesterday'
        ? t('activity.yesterday')
        : new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long' }).format(label);
  return (
    <>
      {groupByDay(events).map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <SectionTitle count={group.events.length}>{dayLabel(group.label)}</SectionTitle>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {group.events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:gap-4"
              >
                <div className="flex items-center gap-2 md:w-40 md:shrink-0">
                  <StatusLight
                    state={
                      event.outcome === 'success'
                        ? 'available'
                        : event.outcome === 'failure'
                          ? 'unavailable'
                          : 'unknown'
                    }
                    label={t(`activity.outcome.${event.outcome}`)}
                  />
                  <Badge variant="outline" className="md:hidden">
                    {t(`activity.chip.${event.kind}`)}
                  </Badge>
                  <span className="ml-auto font-mono text-sm text-muted-foreground md:hidden">
                    {time(event.createdAt)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{t(eventTitleKey(event))}</p>
                  <p className="font-mono text-xs break-words text-muted-foreground">
                    {detailLine(event)
                      .filter(Boolean)
                      .map((part, index) => (
                        <Fragment key={index}>
                          {index > 0 && ' · '}
                          {part}
                        </Fragment>
                      ))}
                  </p>
                  {event.proposalId && (
                    <Link
                      to="/manage/agents"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {t('activity.viewProposal')}
                    </Link>
                  )}
                </div>
                <Badge variant="outline" className="hidden md:inline-flex">
                  {t(`activity.chip.${event.kind}`)}
                </Badge>
                <p className="text-sm text-muted-foreground md:w-36 md:shrink-0 md:text-foreground">
                  <span className="md:hidden">{t('activity.by', { actor: actorName(event) })}</span>
                  <span className="hidden md:inline">{actorName(event)}</span>
                </p>
                <span className="hidden w-12 shrink-0 text-right font-mono text-sm text-muted-foreground md:block">
                  {time(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
