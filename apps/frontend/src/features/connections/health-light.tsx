import { StatusLight } from '@/components/status-light';
import { t } from '@/i18n';
import type { Health } from './connection-model';

const STATE = { ok: 'available', failed: 'unavailable', untested: 'unknown' } as const;

/** The result of the last test, shown with the same light the services use. */
export function HealthLight({ health }: { health: Health }) {
  return <StatusLight state={STATE[health]} label={t(`connections.status.${health}`)} />;
}
