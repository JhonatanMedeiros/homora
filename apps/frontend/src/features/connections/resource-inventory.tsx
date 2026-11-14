import { toast } from 'sonner';
import { useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { RowListSkeleton } from '@/components/skeletons';
import { useResourceInventory } from '@/hooks/use-resource-inventory';
import { deleteLink } from '@/lib/resource-api';
import { filterResources } from '@homora/integrations/resources/client';
import { formatDateTime, t } from '@/i18n';
import { ResourceDiscovery } from './resource-discovery';
import { ResourceLinkDialog } from './resource-link-dialog';
import { ResourceTable } from './resource-table';
import type { Connection } from './connection-model';
import type { IntegrationResource, ResourceState, ResourceType } from '@homora/integrations';

const STATES: ResourceState[] = ['running', 'degraded', 'stopped', 'unknown'];
const TYPES: ResourceType[] = ['application', 'service'];

type Props = { connection: Connection | null; onClose: () => void };

/**
 * Inventory of a integration connection: applications and services the token can read, with the state
 * the integration reports (separate from Homora's HTTP monitor). Cards can be linked or created from here.
 */
export function ResourceInventoryPanel({ connection, onClose }: Props) {
  return (
    <Sheet open={connection !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-4xl">
        {connection && <ResourcesBody connection={connection} />}
      </SheetContent>
    </Sheet>
  );
}

function ResourcesBody({ connection }: { connection: Connection }) {
  const { inventory, links, cards, groups, refreshing, refresh, reloadSide } = useResourceInventory(
    connection.id,
  );
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState<IntegrationResource | null>(null);
  const [creating, setCreating] = useState<IntegrationResource[] | null>(null);
  const [error, setError] = useState('');
  const resources = useMemo(
    () => (inventory.status === 'ready' ? inventory.resources : []),
    [inventory],
  );
  const visible = useMemo(
    () => filterResources(resources, query, type, state),
    [resources, query, type, state],
  );
  const chosen = visible.filter((resource) => selected.has(resource.uuid));

  async function unlink(resource: IntegrationResource) {
    const link = links.find(
      (item) => item.integrationId === connection.id && item.resourceUuid === resource.uuid,
    );
    if (!link) return;
    setError('');
    try {
      await deleteLink(link.serviceId);
      await reloadSide();
      toast.success(t('resources.changeSaved'));
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t('resources.actionFailed');
      setError(message);
      toast.error(message);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('resources.resourcesTitle', { name: connection.name })}</SheetTitle>
        <SheetDescription>{t('resources.resourcesBody')}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Input
              type="search"
              aria-label={t('resources.search')}
              placeholder={t('resources.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="w-40">
            <FormSelect
              aria-label={t('resources.filterType')}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <FormSelectOption value="all">{t('resources.allTypes')}</FormSelectOption>
              {TYPES.map((item) => (
                <FormSelectOption key={item} value={item}>
                  {t(
                    item === 'application'
                      ? 'resources.type.application'
                      : 'resources.type.service',
                  )}
                </FormSelectOption>
              ))}
            </FormSelect>
          </div>
          <div className="w-44">
            <FormSelect
              aria-label={t('resources.filterState')}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <FormSelectOption value="all">{t('resources.allStates')}</FormSelectOption>
              {STATES.map((item) => (
                <FormSelectOption key={item} value={item}>
                  {t(`resources.state.${item}`)}
                </FormSelectOption>
              ))}
            </FormSelect>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RotateCw data-icon="inline-start" />
            )}
            {t('resources.refresh')}
          </Button>
        </div>
        {inventory.status === 'ready' && (
          <p className="text-xs text-muted-foreground">
            {t('resources.lastUpdate', {
              time: inventory.checkedAt
                ? formatDateTime(inventory.checkedAt)
                : t('connections.notReported'),
            })}{' '}
            · {t('resources.scopeNote')}
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {inventory.status === 'loading' ? (
          <RowListSkeleton label={t('resources.loading')} />
        ) : inventory.status === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{inventory.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                {t('resources.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : resources.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="font-label text-lg">{t('resources.empty')}</EmptyTitle>
              <EmptyDescription>{t('resources.emptyHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="font-label text-lg">{t('resources.noMatch')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {t('resources.selected', { count: chosen.length })}
              </span>
              <Button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => setCreating(chosen)}
              >
                {t('resources.createSelected', { count: chosen.length })}
              </Button>
            </div>
            <ResourceTable
              connectionId={connection.id}
              resources={visible}
              selected={selected}
              cards={cards}
              links={links}
              onSelect={(uuid, checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(uuid);
                  else next.delete(uuid);
                  return next;
                })
              }
              onSelectVisible={(checked) =>
                setSelected(checked ? new Set(visible.map((item) => item.uuid)) : new Set())
              }
              onLink={setLinking}
              onCreate={(resource) => setCreating([resource])}
              onUnlink={(resource) => void unlink(resource)}
            />
          </>
        )}
      </div>
      {linking && (
        <ResourceLinkDialog
          connectionId={connection.id}
          resource={linking}
          cards={cards}
          links={links}
          onClose={() => setLinking(null)}
          onDone={() => void reloadSide()}
        />
      )}
      {creating && (
        <ResourceDiscovery
          connectionId={connection.id}
          integrationType={connection.type}
          resources={creating}
          cards={cards}
          groups={groups}
          links={links}
          onClose={() => setCreating(null)}
          onDone={() => {
            setSelected(new Set());
            void reloadSide();
          }}
        />
      )}
    </>
  );
}
