import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Field, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import { defaultConfig, widgetHealthchecksJobsWidget, type Config } from '../definition.js';
import type { JobsResult } from '../source.js';

function View({ config }: { config: Config }) {
  const { t, locale, connectionId, readSource } = useWidgetHost();
  const [reading, setReading] = useState<{
    connectionId: number;
    data: JobsResult | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (connectionId == null || !readSource) return;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const data = await readSource<JobsResult>(
          'healthchecks-jobs',
          { connectionId },
          current.signal,
        );
        if (active && !current.signal.aborted) setReading({ connectionId, data, error: false });
      } catch {
        if (active && !current.signal.aborted)
          setReading({ connectionId, data: null, error: true });
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [connectionId, readSource]);
  if (connectionId == null)
    return <p className="text-sm text-muted-foreground">{t('healthchecksJobs.connection')}</p>;
  if (!readSource || (reading?.connectionId === connectionId && reading.error))
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('healthchecksJobs.error')}
      </p>
    );
  if (!reading || reading.connectionId !== connectionId || !reading.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('healthchecksJobs.loading')}
      </p>
    );
  const data = reading.data;
  const rows = data.checks.slice(0, config.limit);
  const formatTime = (value: number | string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t('healthchecksJobs.reported')}</p>
      <p className="text-xs text-muted-foreground">
        {t('healthchecksJobs.updated', { time: formatTime(data.fetchedAt) })}
      </p>
      {data.stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('healthchecksJobs.stale')}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('healthchecksJobs.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li
              key={index}
              className="flex min-w-0 items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words text-sm font-medium">{row.name}</span>
                {row.lastPing && (
                  <time dateTime={row.lastPing} className="text-xs text-muted-foreground">
                    {t('healthchecksJobs.lastPing', { time: formatTime(row.lastPing) })}
                  </time>
                )}
              </span>
              <span className="shrink-0 text-xs font-medium">
                {t(`healthchecksJobs.${row.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.total > rows.length && (
        <p className="text-xs text-muted-foreground">
          {t('healthchecksJobs.more', { shown: rows.length, total: data.total })}
        </p>
      )}
    </div>
  );
}
function Editor({ config, onChange }: { config: Config; onChange: (config: Config) => void }) {
  const { t } = useWidgetHost();
  return (
    <Field>
      <FieldLabel htmlFor="healthchecks-limit">{t('healthchecksJobs.limit')}</FieldLabel>
      <Input
        id="healthchecks-limit"
        type="number"
        min={1}
        max={50}
        value={config.limit}
        onChange={(event) => onChange({ limit: event.target.valueAsNumber })}
      />
    </Field>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetHealthchecksJobs',
  description: 'pageWidgets.widgetHealthchecksJobsDesc',
  category: 'monitoring',
  keywords: ['healthchecks', 'jobs', 'backups'],
  defaultConfig,
  parse: widgetHealthchecksJobsWidget.parseConfig,
  View: ({ config }) => <View config={config as Config} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as Config} onChange={onChange as (config: Config) => void} />
  ),
  Gallery: () => <Activity aria-hidden="true" />,
  canSubmit: (config) => widgetHealthchecksJobsWidget.parseConfig(config) !== null,
};
