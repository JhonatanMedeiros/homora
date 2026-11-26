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
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:flex sm:flex-wrap">
        {services.map((service) => {
          const view = describeStatus(statuses[service.id], blockedIds.has(service.id), {
            checkType: service.checkType,
          });
          return (
            <li
              key={service.id}
              className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-2.5 sm:flex-nowrap"
            >
              <span aria-hidden="true" className="grid size-6 place-items-center text-sm">
                <ServiceIcon icon={service.icon} name={service.name} />
              </span>
              <a
                href={service.url}
                target={service.openTarget === 'same-tab' ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="max-w-40 truncate rounded-sm max-sm:basis-[calc(100%-2.5rem)] text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {service.name}
                {service.openTarget !== 'same-tab' && (
                  <span className="sr-only top-0 left-0">{t('card.opensNewTab')}</span>
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
                className="min-h-6 rounded-sm px-1.5 text-xs max-sm:ml-auto text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
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
