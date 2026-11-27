import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import type { useServices } from '@/hooks/use-services';
import { formatTime, t } from '@/i18n';

/** The statuses could not be refreshed: what is on screen only says how things were. */
export function StaleStatusAlert({ data }: { data: ReturnType<typeof useServices> }) {
  if (!data.statusError) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status">
          {data.statusAt === null
            ? t('status.stale')
            : t('status.staleSince', { time: formatTime(data.statusAt) })}
        </span>
        <Button type="button" variant="link" size="sm" onClick={data.retryStatuses}>
          {t('status.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
