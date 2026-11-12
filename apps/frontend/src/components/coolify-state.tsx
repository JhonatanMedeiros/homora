import type { CoolifyState } from '@homora/shared';
import { Badge } from '@/components/ui/badge';
import { t, type MessageKey } from '@/i18n';

export type CoolifyDisplayState = CoolifyState | 'unavailable' | 'missing';

const view: Record<
  CoolifyDisplayState,
  { label: MessageKey; variant: 'success' | 'secondary' | 'outline' | 'destructive' }
> = {
  running: { label: 'coolify.state.running', variant: 'success' },
  degraded: { label: 'coolify.state.degraded', variant: 'outline' },
  stopped: { label: 'coolify.state.stopped', variant: 'secondary' },
  unknown: { label: 'coolify.state.unknown', variant: 'outline' },
  unavailable: { label: 'coolify.state.unavailable', variant: 'outline' },
  missing: { label: 'coolify.state.missing', variant: 'outline' },
};

/**
 * The state Coolify reports for a resource. It is not the HTTP availability Homora checks (that is
 * the StatusLight) and never claims "offline": a failed or missing read is shown as such.
 */
export function CoolifyStateBadge({ state }: { state: CoolifyDisplayState }) {
  const { label, variant } = view[state];
  return <Badge variant={variant}>{t(label)}</Badge>;
}
