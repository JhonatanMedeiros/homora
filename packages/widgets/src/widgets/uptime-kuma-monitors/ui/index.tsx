import { Activity } from 'lucide-react';
import { cn } from '@homora/ui/lib/utils';
import { Input } from '@homora/ui/input';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import { defaultConfig, widgetUptimeKumaMonitorsWidget, type Config } from '../definition.js';
import { parseMonitors, selectMonitors } from '../logic.js';

function View({ config }: { config: Config }) {
  const { t, connectionReading } = useWidgetHost();
  const rows = connectionReading?.status === 'ready' ? parseMonitors(connectionReading.data) : null;
  const selected = rows && selectMonitors(rows, config);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t('kumaMonitors.reported')}</p>
      {connectionReading ? (
        connectionReading.status === 'loading' ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('kumaMonitors.loading')}
          </p>
        ) : !selected ? (
          <p role="alert" className="text-sm text-destructive">
            {t('kumaMonitors.error')}
          </p>
        ) : (
          <>
            {connectionReading.status === 'ready' && connectionReading.stale && (
              <p role="status" className="text-xs text-muted-foreground">
                {t('kumaMonitors.stale')}
              </p>
            )}
            {selected.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('kumaMonitors.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selected.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex min-w-0 items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="break-words text-sm font-medium">{row.name}</span>
                      <span className="break-words text-xs text-muted-foreground">{row.group}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          row.status === 'up'
                            ? 'bg-success'
                            : row.status === 'down'
                              ? 'bg-destructive'
                              : row.status === 'maintenance'
                                ? 'bg-info'
                                : row.status === 'pending'
                                  ? 'bg-warning'
                                  : 'ring-[1.5px] ring-inset ring-muted-foreground',
                        )}
                      />
                      {t(`kumaMonitors.${row.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {selected.total > selected.rows.length && (
              <p className="text-xs text-muted-foreground">
                {t('kumaMonitors.more', { shown: selected.rows.length, total: selected.total })}
              </p>
            )}
          </>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t('kumaMonitors.preview')}</p>
      )}
    </div>
  );
}
function Editor({ config, onChange }: { config: Config; onChange: (config: Config) => void }) {
  const { t } = useWidgetHost();
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="kuma-group">{t('kumaMonitors.group')}</FieldLabel>
        <Input
          id="kuma-group"
          maxLength={256}
          value={config.group}
          onChange={(event) => onChange({ ...config, group: event.target.value })}
        />
        <FieldDescription>{t('kumaMonitors.groupHelp')}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="kuma-limit">{t('kumaMonitors.limit')}</FieldLabel>
        <Input
          id="kuma-limit"
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
  name: 'pageWidgets.widgetUptimeKumaMonitors',
  description: 'pageWidgets.widgetUptimeKumaMonitorsDesc',
  category: 'monitoring',
  keywords: ['uptime kuma', 'monitors', 'status'],
  defaultConfig,
  parse: widgetUptimeKumaMonitorsWidget.parseConfig,
  View: ({ config }) => <View config={config as Config} />,
  Editor: ({ config, onChange }) => <Editor config={config as Config} onChange={onChange} />,
  Gallery: () => <Activity aria-hidden="true" />,
  canSubmit: (config) => !!widgetUptimeKumaMonitorsWidget.parseConfig(config),
};
