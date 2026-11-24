import { Server } from 'lucide-react';
import { Input } from '@homora/ui/input';
import { Skeleton } from '@homora/ui/skeleton';
import { Field, FieldLabel } from '@homora/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@homora/ui/select';
import { cn } from '@homora/ui/lib/utils';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import { defaultConfig, widgetCoolifyResourcesWidget, type Config } from '../definition.js';
import { parseResources, selectResources } from '../logic.js';

function View({ config }: { config: Config }) {
  const { t, connectionReading } = useWidgetHost();
  const resources =
    connectionReading?.status === 'ready' && !connectionReading.stale
      ? parseResources(connectionReading.data)
      : null;
  const selected = resources && selectResources(resources, config);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t('coolifyResources.reported')}</p>
      {connectionReading ? (
        connectionReading.status === 'loading' ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-2">
            <span className="sr-only">{t('coolifyResources.loading')}</span>
            {[0, 1, 2].map((row) => (
              <div key={row} aria-hidden="true" className="flex items-center justify-between gap-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : !selected ? (
          <p role="alert" className="text-sm text-destructive">
            {t('coolifyResources.error')}
          </p>
        ) : (
          <>
            {selected.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('coolifyResources.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selected.rows.map((row) => (
                  <li
                    key={row.uuid}
                    className="flex min-w-0 items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`coolifyResources.${row.type}`)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {row.urls.map((url, i) => (
                          <a
                            className="text-xs underline"
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('coolifyResources.link', { number: i + 1, name: row.name })}
                          </a>
                        ))}
                      </div>
                    </div>
                    <span className="inline-flex min-w-0 items-center gap-1.5 break-all text-xs">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          row.state === 'running'
                            ? 'bg-success'
                            : row.state === 'stopped'
                              ? 'bg-destructive'
                              : row.state === 'degraded'
                                ? 'bg-warning'
                                : 'ring-[1.5px] ring-inset ring-muted-foreground',
                        )}
                      />
                      {t(`coolifyResources.${row.state}`)}
                      {row.state === 'unknown' && row.rawStatus ? ` (${row.rawStatus})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {selected.total > selected.rows.length && (
              <p className="text-xs text-muted-foreground">
                {t('coolifyResources.more', { shown: selected.rows.length, total: selected.total })}
              </p>
            )}
          </>
        )
      ) : (
        <p>{t('coolifyResources.preview')}</p>
      )}
    </div>
  );
}
function Editor({ config, onChange }: { config: Config; onChange: (config: Config) => void }) {
  const { t } = useWidgetHost();
  return (
    <div className="flex flex-col gap-3">
      {(['type', 'state'] as const).map((field) => (
        <Field key={field}>
          <FieldLabel htmlFor={`coolify-${field}`}>{t(`coolifyResources.${field}`)}</FieldLabel>
          <Select
            value={config[field]}
            onValueChange={(value) => onChange({ ...config, [field]: value })}
          >
            <SelectTrigger id={`coolify-${field}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(field === 'type'
                ? ['all', 'application', 'service']
                : ['all', 'running', 'degraded', 'stopped', 'unknown']
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`coolifyResources.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ))}
      <Field>
        <FieldLabel htmlFor="coolify-limit">{t('coolifyResources.limit')}</FieldLabel>
        <Input
          id="coolify-limit"
          type="number"
          min={1}
          max={50}
          value={config.limit}
          onChange={(event) => onChange({ ...config, limit: event.target.valueAsNumber })}
        />
      </Field>
    </div>
  );
}
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetCoolifyResources',
  description: 'pageWidgets.widgetCoolifyResourcesDesc',
  category: 'monitoring',
  keywords: ['coolify', 'resources'],
  defaultConfig,
  parse: widgetCoolifyResourcesWidget.parseConfig,
  View: ({ config }) => <View config={config as Config} />,
  Editor: ({ config, onChange }) => <Editor config={config as Config} onChange={onChange} />,
  Gallery: () => <Server aria-hidden="true" />,
  canSubmit: (config) => !!widgetCoolifyResourcesWidget.parseConfig(config),
};
