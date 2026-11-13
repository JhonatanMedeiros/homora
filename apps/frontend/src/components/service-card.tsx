import { describeStatus } from '@/lib/status-text';
import { ServiceCardList } from '@/components/service-card-list';
import { ServiceCardTile } from '@/components/service-card-tile';
import type { ServiceCardProps } from '@/components/service-card.types';

/** A service in list or tile view; each layout owns its own markup and interaction state. */
export function ServiceCard(props: ServiceCardProps) {
  const view = describeStatus(props.status, props.blocked);
  const layoutProps = { ...props, view };
  return props.list ? <ServiceCardList {...layoutProps} /> : <ServiceCardTile {...layoutProps} />;
}
