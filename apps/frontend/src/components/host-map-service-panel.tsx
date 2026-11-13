import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { StatusLight } from '@/components/status-light';
import { describeStatus } from '@/lib/status-text';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { t } from '@/i18n';

export type HostMapServicePanelProps = {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  runsOn: string;
  page?: string;
  impact: string;
  dependsOnList: { id: number; name: string }[];
  usedByList: { id: number; name: string }[];
  canEdit: boolean;
  onSelect: (id: number) => void;
  onAddDependency: () => void;
  onRemoveDependency: (id: number) => void;
  onOpenCard: () => void;
  onChangeHost: () => void;
  hostEditor: React.ReactNode;
};

export function HostMapServicePanel({
  service,
  status,
  blocked,
  runsOn,
  page,
  impact,
  dependsOnList,
  usedByList,
  canEdit,
  onSelect,
  onAddDependency,
  onRemoveDependency,
  onOpenCard,
  onChangeHost,
  hostEditor,
}: {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  runsOn: string;
  page?: string;
  impact: string;
  dependsOnList: { id: number; name: string }[];
  usedByList: { id: number; name: string }[];
  canEdit: boolean;
  onSelect: (id: number) => void;
  onAddDependency: () => void;
  onRemoveDependency: (id: number) => void;
  onOpenCard: () => void;
  onChangeHost: () => void;
  hostEditor: React.ReactNode;
}) {
  const view = describeStatus(status, blocked);
  const [editingHost, setEditingHost] = useState(false);
  const label = 'text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-base font-semibold break-words">{service.name}</h4>
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
      </div>
      {page && (
        <div className="flex flex-col gap-1">
          <span className={label}>{t('pages.title')}</span>
          <p className="text-sm break-words">{page}</p>
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
      <Button type="button" variant="outline" size="sm" onClick={onOpenCard}>
        {t('map.panel.openCard')}
      </Button>
    </div>
  );
}
