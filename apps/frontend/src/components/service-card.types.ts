import type { Service, UptimeRange, UptimeSummary } from '@homora/shared';
import type { CardResource } from '@/hooks/use-resource-links';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import type { HostLabel, Impact } from '@/lib/hosts';
import type { ServiceStatus } from '@/lib/services';
import type { StatusView } from '@/lib/status-text';

export type ServiceCardProps = {
  service: Service;
  status?: ServiceStatus;
  widgets?: CardWidgetState[];
  /** Linked integration resource, with the state the integration reports (separate from the HTTP status). */
  resourceLink?: CardResource;
  onResource?: () => void;
  uptime?: UptimeSummary;
  uptimeRange?: UptimeRange;
  onUptimeRangeChange?: (range: UptimeRange) => void;
  /** Where the card runs, resolved from the live Proxmox inventory (null when not linked). */
  host?: HostLabel | null;
  /** Why the card may be affected; text is always shown, never only color. */
  impact?: Impact;
  /** "May be affected" through manual dependencies; always labelled as manual. */
  dependencyNote?: string;
  blocked: boolean;
  managing: boolean;
  list?: boolean;
  showDescription: boolean;
  confirmingRemoval: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCancelRemoval: () => void;
};

export type ServiceCardLayoutProps = ServiceCardProps & { view: StatusView };
