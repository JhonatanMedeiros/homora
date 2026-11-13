import { t } from '@/i18n';
import type { HostLabel, Impact } from '@/lib/hosts';

/** Latency or fallback next to the status, with the type of check as a small tag. */
export function StatusMeta({
  tag,
  meta,
  title,
}: {
  tag: string | null;
  meta: string | null;
  title: string | null;
}) {
  if (!tag && !meta) return null;
  return (
    <span
      title={title ?? undefined}
      className="inline-flex shrink-0 items-center gap-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {tag && (
        <span className="rounded-sm border px-1 py-0.5 text-[0.625rem] leading-none tracking-wider uppercase">
          {tag}
        </span>
      )}
      {meta}
    </span>
  );
}

/** Where a card runs; text only, so it never depends on color. */
function hostText(host: HostLabel) {
  if (host.kind === 'found')
    return `${t('hosts.runsOn')} ${host.guest.name || host.guest.vmid} · ${t('hosts.on', { node: host.guest.node })}`;
  return host.kind === 'missing' ? t('hosts.notFound') : t('hosts.unavailable');
}

const IMPACT_TEXT = {
  'host-offline': 'hosts.impact.hostOffline',
  'guest-stopped': 'hosts.impact.guestStopped',
  'service-down': 'hosts.impact.serviceDown',
  unknown: 'hosts.impact.unknown',
} as const;

export function HostLine({ host, impact }: { host: HostLabel; impact: Impact }) {
  const key = impact in IMPACT_TEXT ? IMPACT_TEXT[impact as keyof typeof IMPACT_TEXT] : null;
  return (
    <span className="truncate text-xs text-muted-foreground">
      {hostText(host)}
      {key && (
        <>
          {' · '}
          <strong
            className={impact === 'unknown' ? 'font-medium' : 'font-semibold text-destructive'}
          >
            {t(key)}
          </strong>
        </>
      )}
    </span>
  );
}
