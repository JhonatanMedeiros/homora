import { describeStatus } from '@/lib/status-text';
import { ServiceCardCompact } from '@/features/dashboard/service-card-compact';
import { ServiceCardList } from '@/features/dashboard/service-card-list';
import { ServiceCardTile } from '@/features/dashboard/service-card-tile';
import type { ServiceCardProps } from '@/features/dashboard/service-card.types';

/** A service in compact, list or card view; each layout owns its own markup and interaction state. */
export function ServiceCard(props: ServiceCardProps) {
  const view = describeStatus(props.status, props.blocked, {
    monitor: props.monitor,
    downSince: props.incident?.startedAt,
    checkType: props.service.checkType,
    maintenanceUntil: props.maintenanceUntil,
  });
  const layoutProps = { ...props, view };
  if (props.compact && !props.list) return <ServiceCardCompact {...layoutProps} />;
  return props.list ? <ServiceCardList {...layoutProps} /> : <ServiceCardTile {...layoutProps} />;
}
