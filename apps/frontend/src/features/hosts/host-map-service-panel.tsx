import { useState } from 'react';
import { Plus, TriangleAlert, X } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router';
import type { Service } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { ServiceIcon } from '@/components/service-icon';
import { StatusMeta } from '@/features/dashboard/service-card-common';
import { CardWidgets } from '@/components/card-widgets';
import { ServiceUptime } from '@/features/uptime/service-uptime';
import type { ServiceCardProps } from '@/features/dashboard/service-card.types';
import { StatusLight } from '@/components/status-light';
import { describeStatus } from '@/lib/status-text';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { ServiceLinksMenu } from '@/components/service-links-menu';
import { t } from '@/i18n';

export type HostMapServicePanelProps = {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  runsOn: string;
  page?: string;
  impact: string;
  /** When the open incident began; the alert block says how long the service has been down. */
  downSince?: number | null;
  /** Dependencies from the outermost one down to this service; empty when none are recorded. */
  chain: { id: number; name: string }[];
  /** Best guess for a service with no host, with the evidence behind it. */
  suggestion?: {
    guest: string;
    strong: boolean;
    ambiguous: boolean;
    evidence: string[];
  };
  /** True when the service is marked as not running on a guest. */
  external: boolean;
  dependsOnList: { id: number; name: string }[];
  usedByList: { id: number; name: string }[];
  canEdit: boolean;
  onSelect: (id: number) => void;
  onAddDependency: () => void;
  onRemoveDependency: (id: number) => void;
  onOpenCard: () => void;
  onChangeHost: () => void;
  onLinkSuggestion: () => void;
  onDismissSuggestion: () => void;
  onMarkExternal: (external: boolean) => void;
  hostEditor: React.ReactNode;
} & Pick<
  ServiceCardProps,
  'widgets' | 'uptime' | 'monitor' | 'tags' | 'uptimeRange' | 'onUptimeRangeChange'
>;

export function HostMapServicePanel({
  service,
  status,
  blocked,
  runsOn,
  page,
  impact,
  downSince,
  chain,
  suggestion,
  external,
  dependsOnList,
  usedByList,
  canEdit,
  onSelect,
  onAddDependency,
  onRemoveDependency,
  onOpenCard,
  onChangeHost,
  onLinkSuggestion,
  onDismissSuggestion,
  onMarkExternal,
  hostEditor,
  widgets,
  uptime,
  monitor,
  tags,
  uptimeRange,
  onUptimeRangeChange,
}: HostMapServicePanelProps) {
  const view = describeStatus(status, blocked, {
    monitor,
    checkType: service.checkType,
    downSince,
  });
  const troubled = view.state === 'unavailable' || view.state === 'degraded';
  const [editingHost, setEditingHost] = useState(false);
  const inRouter = useInRouterContext();
  const label = 'text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-lg font-semibold"
            >
              <ServiceIcon icon={service.icon} name={service.name} />
            </span>
            <h4 className="text-base font-semibold break-words">{service.name}</h4>
          </div>
          <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
        </div>
        <a
          href={service.url}
          target={service.openTarget === 'same-tab' ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="w-fit rounded-sm font-mono text-xs break-all text-muted-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {hostOf(service.url)}
          {service.openTarget !== 'same-tab' && (
            <span className="sr-only">{t('card.opensNewTab')}</span>
          )}
        </a>
        <div className="-ml-2">
          <ServiceLinksMenu service={service} align="start" />
        </div>
      </div>
      {service.description && (
        <p className="text-sm text-muted-foreground">{service.description}</p>
      )}
      {troubled && !view.blocked && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm"
        >
          <span className="flex items-center gap-1.5 font-semibold text-destructive">
            <TriangleAlert aria-hidden="true" className="size-4" />
            {t('map.panel.alert')}
          </span>
          {view.note && <p>{view.note}</p>}
          {impact && <p className="text-muted-foreground">{impact}</p>}
        </div>
      )}
      {(view.note || view.meta || view.tag) && !troubled && (
        <div className="flex flex-col gap-1 text-sm">
          <StatusMeta tag={view.tag} meta={view.meta} title={view.title} />
          {view.note && <p className="text-muted-foreground">{view.note}</p>}
        </div>
      )}
      <CardWidgets widgets={widgets ?? []} />
      <ServiceUptime
        service={service}
        summary={uptime}
        monitor={monitor}
        range={uptimeRange ?? '24h'}
        onRangeChange={onUptimeRangeChange ?? (() => {})}
      />
      {tags && tags.length > 0 && (
        <ul aria-label={t('form.tags')} className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {tag}
            </li>
          ))}
        </ul>
      )}
      {page && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('pages.title')}</span>
          <p className="text-sm break-words">{page}</p>
        </div>
      )}
      {suggestion && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/50 bg-accent/40 p-3 text-sm">
          <span className="font-semibold">
            {t(suggestion.strong ? 'map.suggest.strong' : 'map.suggest.medium')}: {suggestion.guest}
          </span>
          {suggestion.ambiguous && (
            <p className="text-muted-foreground">{t('hosts.suggest.ambiguous')}</p>
          )}
          {suggestion.evidence.length > 0 && (
            <ul aria-label={t('map.suggest.evidence')} className="text-xs text-muted-foreground">
              {suggestion.evidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="pointer-coarse:h-11"
                onClick={onLinkSuggestion}
              >
                {t('map.suggest.link', { guest: suggestion.guest })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                onClick={onDismissSuggestion}
              >
                {t('map.suggest.dismiss')}
              </Button>
            </div>
          )}
        </div>
      )}
      {chain.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('map.panel.reachedThrough')}</span>
          <ol className="flex flex-wrap items-center gap-x-1.5 text-sm">
            {chain.map((item, index) => (
              <li key={item.id} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">→</span>}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 pointer-coarse:min-h-11"
                  aria-current={item.id === service.id ? 'true' : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  {item.name}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={label}>{t('map.panel.runsOn')}</span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs pointer-coarse:min-h-11"
            onClick={() => (hostEditor ? setEditingHost((open) => !open) : onChangeHost())}
          >
            {editingHost ? t('dependencies.cancel') : t('map.panel.changeHost')}
          </Button>
        </div>
        <p className="text-sm break-words">{runsOn}</p>
        {editingHost && hostEditor}
      </div>
      {impact && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('map.panel.affectedBy')}</span>
          <p className="text-sm">{impact}</p>
        </div>
      )}
      {(dependsOnList.length > 0 || canEdit) && (
        <div className="flex flex-col gap-1">
          <span
            className={label}
          >{`${t('dependencies.title')} (${t('dependencies.manual')})`}</span>
          {dependsOnList.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {dependsOnList.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 pointer-coarse:min-h-11"
                    onClick={() => onSelect(item.id)}
                  >
                    {item.name}
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 pointer-coarse:size-11"
                      aria-label={t('dependencies.remove', { name: item.name })}
                      onClick={() => onRemoveDependency(item.id)}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit border-dashed"
              onClick={onAddDependency}
            >
              <Plus data-icon="inline-start" />
              {t('dependencies.add')}
            </Button>
          )}
        </div>
      )}
      {usedByList.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('dependencies.usedBy')}</span>
          <ul className="flex flex-wrap gap-x-3">
            {usedByList.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 pointer-coarse:min-h-11"
                  onClick={() => onSelect(item.id)}
                >
                  {item.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="pointer-coarse:h-11">
          <a
            href={service.url}
            target={service.openTarget === 'same-tab' ? undefined : '_blank'}
            rel="noopener noreferrer"
          >
            {t('map.panel.openService')}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={onOpenCard}
        >
          {t('map.panel.openCard')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={onChangeHost}
        >
          {t('common.edit')}
        </Button>
        {canEdit && !service.host && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:h-11"
            onClick={() => onMarkExternal(!external)}
          >
            {t(external ? 'map.external.unmark' : 'map.external.mark')}
          </Button>
        )}
      </div>
      {inRouter && (
        <Link
          to={`/services/${service.id}`}
          className="w-fit rounded-sm text-sm underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('map.panel.uptimeLink')}
        </Link>
      )}
    </div>
  );
}
