import { Star } from 'lucide-react';
import type { Service } from '@homora/shared';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import { t } from '@/i18n';

type Props = {
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onDetails: (service: Service) => void;
};

/**
 * Favorites as a quick launcher above the groups. Opening a service stays one click: the name is
 * the link, and the state is always written next to its light.
 */
export function PinnedRow({ services, statuses, blockedIds, onDetails }: Props) {
  if (services.length === 0) return null;
  return (
    <section aria-label={t('pinned.title')} data-homora="pinned" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Star aria-hidden="true" className="size-3.5" />
        {t('pinned.title')}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {services.map((service) => {
          const view = describeStatus(statuses[service.id], blockedIds.has(service.id), {
            checkType: service.checkType,
          });
          return (
            <li
              key={service.id}
              className="flex min-w-0 items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-2.5"
            >
              <span aria-hidden="true" className="grid size-6 place-items-center text-sm">
                <ServiceIcon icon={service.icon} name={service.name} />
              </span>
              <a
                href={service.url}
                target={service.openTarget === 'same-tab' ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="max-w-40 truncate rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {service.name}
                {service.openTarget !== 'same-tab' && (
                  <span className="sr-only">{t('card.opensNewTab')}</span>
                )}
              </a>
              <StatusLight
                state={view.state}
                blocked={view.blocked}
                label={view.label}
                className="text-xs"
              />
              <button
                type="button"
                onClick={() => onDetails(service)}
                aria-label={t('card.detailsFor', { name: service.name })}
                className="rounded-sm px-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
              >
                {t('card.details')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
