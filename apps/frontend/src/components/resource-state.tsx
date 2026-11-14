import { Badge } from '@/components/ui/badge';
import { t, type MessageKey } from '@/i18n';
import type { ResourceState } from '@homora/integrations';

export type ResourceDisplayState = ResourceState | 'unavailable' | 'missing';

const view: Record<
  ResourceDisplayState,
  { label: MessageKey; variant: 'success' | 'secondary' | 'outline' | 'destructive' }
> = {
  running: { label: 'resources.state.running', variant: 'success' },
  degraded: { label: 'resources.state.degraded', variant: 'outline' },
  stopped: { label: 'resources.state.stopped', variant: 'secondary' },
  unknown: { label: 'resources.state.unknown', variant: 'outline' },
  unavailable: { label: 'resources.state.unavailable', variant: 'outline' },
  missing: { label: 'resources.state.missing', variant: 'outline' },
};

/**
 * The state the integration reports for a resource. It is not the HTTP availability Homora checks (that is
 * the StatusLight) and never claims "offline": a failed or missing read is shown as such.
 */
export function ResourceStateBadge({ state }: { state: ResourceDisplayState }) {
  const { label, variant } = view[state];
  return <Badge variant={variant}>{t(label)}</Badge>;
}
