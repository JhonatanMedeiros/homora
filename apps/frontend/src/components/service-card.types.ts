import type {
  Incident,
  MonitorSettings,
  Service,
  UptimeRange,
  UptimeSummary,
} from '@homora/shared';
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
  /** Alert settings (degraded limit) and the incident the service is in right now, if any. */
  monitor?: MonitorSettings;
  incident?: Incident;
  /** End of the maintenance window the service is in right now. */
  maintenanceUntil?: number | null;
  /** Labels on the service; clicking one filters the Home by it. */
  tags?: string[];
  onTag?: (tag: string) => void;
  uptimeRange?: UptimeRange;
  onUptimeRangeChange?: (range: UptimeRange) => void;
  /** Where the card runs, resolved from the live host inventory (null when not linked). */
  host?: HostLabel | null;
  /** Why the card may be affected; text is always shown, never only color. */
  impact?: Impact;
  /** "May be affected" through manual dependencies; always labelled as manual. */
  dependencyNote?: string;
  blocked: boolean;
  list?: boolean;
  /** Dense tile of the Home: icon, name, host, state and a quiet bar. */
  compact?: boolean;
  showDescription: boolean;
  /** Opens the details drawer of this service. */
  onDetails?: () => void;
  /** Opens the edit form (used by the failure details). */
  onEdit: () => void;
};

export type ServiceCardLayoutProps = ServiceCardProps & { view: StatusView };
