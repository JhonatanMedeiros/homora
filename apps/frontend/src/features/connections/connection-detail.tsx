import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatAgo, formatDateTime, t } from '@/i18n';
import { hasInventoryDomain } from '@homora/integrations';
import { HealthLight } from './health-light';
import { describeData, healthOf, hostOf, reasonKey, type Connection } from './connection-model';

type Props = {
  item: Connection;
  widgetCount: number;
  busy: boolean;
  testing: boolean;
  data: { data: unknown; checkedAt?: string } | null;
  onEdit: (fromFailure: boolean) => void;
  onTest: () => void;
  onRefreshData: () => void;
  onResources: () => void;
  onRemove: () => void;
};

/** What the dialog shows for a connection: how it is doing and everything you can do to it. */
export function ConnectionDetail({
  item,
  widgetCount,
  busy,
  testing,
  data,
  onEdit,
  onTest,
  onRefreshData,
  onResources,
  onRemove,
}: Props) {
  const health = healthOf(item);
  const rejected = item.lastTest?.result === 'rejected';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <HealthLight health={health} />
        {item.lastTest && (
          <span className="text-sm text-muted-foreground">
            {t('connections.testedAt', { time: formatAgo(item.lastTest.at) })}
          </span>
        )}
      </div>
      {health === 'failed' && item.lastTest && (
        <Alert variant="destructive">
          <AlertDescription>{t(reasonKey(item.lastTest.result))}</AlertDescription>
        </Alert>
      )}
      {health === 'untested' && (
        <p className="text-sm text-muted-foreground">{t('connections.neverTested')}</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('connections.detailAddress')}</dt>
        <dd className="min-w-0 font-mono text-[0.8125rem] break-all">{hostOf(item.url)}</dd>
        {item.lastTest && (
          <>
            <dt className="text-muted-foreground">{t('connections.detailLastTest')}</dt>
            <dd>{formatDateTime(item.lastTest.at)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('connections.detailCredentials')}</dt>
        <dd>
          {item.hasSecret ? t('connections.credentialsSaved') : t('connections.credentialsNone')}
        </dd>
        <dt className="text-muted-foreground">{t('connections.detailWidgets')}</dt>
        <dd>
          {widgetCount === 0
            ? t('connections.widgetsNone')
            : t('connections.widgetsCount', { count: widgetCount })}
        </dd>
      </dl>
      {data && (
        <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
          <p className="font-medium">{t('connections.currentData')}</p>
          <p className="font-mono text-[0.8125rem]">
            {describeData(item.type, data.data) ?? t('connections.invalidData')}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => onEdit(rejected)}>
          {rejected && item.hasSecret ? t('connections.updateSecret') : t('common.edit')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onTest}>
          {testing && <Spinner data-icon="inline-start" />}
          {t('connections.testAction')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onRefreshData}>
          {t('connections.refreshData')}
        </Button>
        {hasInventoryDomain(item.type, 'resources') && (
          <Button type="button" variant="outline" disabled={busy} onClick={onResources}>
            {t('resources.resourcesAction')}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className="text-destructive hover:text-destructive sm:ml-auto"
          onClick={onRemove}
        >
          {t('common.remove')}
        </Button>
      </div>
    </div>
  );
}
