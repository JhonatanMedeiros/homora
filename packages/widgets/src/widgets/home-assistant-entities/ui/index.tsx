import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Textarea } from '@homora/ui/textarea';
import { useWidgetHost, WidgetSourceError } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import {
  defaultConfig,
  MAX_ENTITIES,
  widgetHomeAssistantEntitiesWidget,
  type Config,
} from '../definition.js';
import type { HomeAssistantEntitiesResult } from '../source.js';

type Reading =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: HomeAssistantEntitiesResult; stale: boolean };

const REFRESH_INTERVAL_MS = 30_000;

function useEntityStates(config: Config): Reading {
  const { connectionId, readSource } = useWidgetHost();
  const entityIds = config.entities.join(',');
  const key =
    connectionId !== undefined && connectionId !== null && entityIds.length > 0
      ? `${connectionId}\0${entityIds}`
      : '';
  const [state, setState] = useState<{
    key: string;
    data: HomeAssistantEntitiesResult | null;
    failed: boolean;
  }>({ key, data: null, failed: false });

  useEffect(() => {
    if (!key || connectionId === undefined || connectionId === null || !entityIds) return;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!readSource) throw new WidgetSourceError('fetch-failed', 'Widget source unavailable');
        const data = await readSource<HomeAssistantEntitiesResult>(
          'home-assistant-entities',
          { connectionId, entities: entityIds },
          request.signal,
        );
        if (active && !request.signal.aborted) setState({ key, data, failed: false });
      } catch {
        if (!active || request.signal.aborted) return;
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : null,
          failed: true,
        }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [connectionId, entityIds, key, readSource]);

  if (!entityIds) return { status: 'unconfigured' };
  if (connectionId === undefined || connectionId === null) return { status: 'unconfigured' };
  if (state.key !== key || !state.data) return { status: state.failed ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    stale: state.data.stale || state.failed,
  };
}

function formatUpdated(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function View({ config }: { config: Config }) {
  const { t, locale, connectionId } = useWidgetHost();
  const reading = useEntityStates(config);
  if (reading.status === 'unconfigured') {
    return (
      <p className="text-sm text-muted-foreground">
        {connectionId === undefined || connectionId === null
          ? t('homeAssistantEntities.connectionRequired')
          : t('homeAssistantEntities.empty')}
      </p>
    );
  }
  if (reading.status === 'loading') {
    return (
      <p role="status" aria-busy="true" className="text-sm text-muted-foreground">
        {t('homeAssistantEntities.loading')}
      </p>
    );
  }
  if (reading.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('homeAssistantEntities.error')}
      </p>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {reading.stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('homeAssistantEntities.stale')}
        </p>
      )}
      <ul className="flex min-w-0 flex-col gap-2">
        {reading.data.entities.map((entity) => {
          const updated =
            entity.status === 'ready' ? formatUpdated(entity.lastUpdated ?? null, locale) : null;
          return (
            <li
              key={entity.entityId}
              className="flex min-w-0 flex-col gap-0.5 border-b pb-2 last:border-0 last:pb-0"
            >
              <span className="break-all text-xs text-muted-foreground">{entity.entityId}</span>
              <span className="break-words text-sm font-medium">
                {entity.status === 'ready'
                  ? entity.state
                  : t(
                      entity.status === 'not-found'
                        ? 'homeAssistantEntities.notFound'
                        : 'homeAssistantEntities.unavailable',
                    )}
              </span>
              {updated && (
                <time
                  dateTime={entity.lastUpdated ?? undefined}
                  className="text-xs text-muted-foreground"
                >
                  {t('homeAssistantEntities.updated', { time: updated })}
                </time>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Editor({ config, onChange }: { config: Config; onChange: (config: Config) => void }) {
  const { t } = useWidgetHost();
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="ha-entities">{t('homeAssistantEntities.entities')}</FieldLabel>
        <Textarea
          id="ha-entities"
          rows={Math.min(MAX_ENTITIES, Math.max(3, config.entities.length))}
          maxLength={MAX_ENTITIES * 256}
          value={config.entities.join('\n')}
          onChange={(event) =>
            onChange({
              entities: event.target.value.split(/\r?\n/).map((entity) => entity.trim()),
            })
          }
          aria-invalid={!widgetHomeAssistantEntitiesWidget.parseConfig(config)}
        />
        <FieldDescription>{t('homeAssistantEntities.entitiesHelp')}</FieldDescription>
      </Field>
    </FieldGroup>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetHomeAssistantEntities',
  description: 'pageWidgets.widgetHomeAssistantEntitiesDesc',
  category: 'monitoring',
  keywords: ['home assistant', 'entities', 'sensors', 'states'],
  defaultConfig,
  parse: widgetHomeAssistantEntitiesWidget.parseConfig,
  View: ({ config }) => <View config={config as Config} />,
  Editor: ({ config, onChange }) => (
    <Editor config={config as Config} onChange={onChange as (config: Config) => void} />
  ),
  Gallery: () => <Home aria-hidden="true" />,
  canSubmit: (config) => widgetHomeAssistantEntitiesWidget.parseConfig(config) !== null,
};
