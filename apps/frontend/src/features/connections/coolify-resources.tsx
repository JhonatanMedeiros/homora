import { useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { CoolifyResource, CoolifyState, CoolifyResourceType } from '@homora/shared';
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
import { useCoolifyResources } from '@/hooks/use-coolify-resources';
import { deleteLink } from '@/lib/coolify-api';
import { filterResources } from '@/lib/coolify';
import { formatDateTime, t } from '@/i18n';
import { CoolifyDiscovery } from './coolify-discovery';
import { CoolifyLinkDialog } from './coolify-link-dialog';
import { CoolifyResourceTable } from './coolify-resource-table';
import type { Connection } from './connection-model';

const STATES: CoolifyState[] = ['running', 'degraded', 'stopped', 'unknown'];
const TYPES: CoolifyResourceType[] = ['application', 'service'];

type Props = { connection: Connection | null; onClose: () => void };

/**
 * Inventory of a Coolify connection: applications and services the token can read, with the state
 * Coolify reports (separate from Homora's HTTP monitor). Cards can be linked or created from here.
 */
export function CoolifyResources({ connection, onClose }: Props) {
  return (
    <Sheet open={connection !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-4xl">
        {connection && <ResourcesBody connection={connection} />}
      </SheetContent>
    </Sheet>
  );
}

function ResourcesBody({ connection }: { connection: Connection }) {
  const { inventory, links, cards, groups, refreshing, refresh, reloadSide } = useCoolifyResources(
    connection.id,
  );
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState<CoolifyResource | null>(null);
  const [creating, setCreating] = useState<CoolifyResource[] | null>(null);
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

  async function unlink(resource: CoolifyResource) {
    const link = links.find(
      (item) => item.integrationId === connection.id && item.resourceUuid === resource.uuid,
    );
    if (!link) return;
    setError('');
    try {
      await deleteLink(link.serviceId);
      await reloadSide();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('coolify.actionFailed'));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t('coolify.resourcesTitle', { name: connection.name })}</SheetTitle>
        <SheetDescription>{t('coolify.resourcesBody')}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Input
              type="search"
              aria-label={t('coolify.search')}
              placeholder={t('coolify.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="w-40">
            <FormSelect
              aria-label={t('coolify.filterType')}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <FormSelectOption value="all">{t('coolify.allTypes')}</FormSelectOption>
              {TYPES.map((item) => (
                <FormSelectOption key={item} value={item}>
                  {t(item === 'application' ? 'coolify.type.application' : 'coolify.type.service')}
                </FormSelectOption>
              ))}
            </FormSelect>
          </div>
          <div className="w-44">
            <FormSelect
              aria-label={t('coolify.filterState')}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <FormSelectOption value="all">{t('coolify.allStates')}</FormSelectOption>
              {STATES.map((item) => (
                <FormSelectOption key={item} value={item}>
                  {t(`coolify.state.${item}`)}
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
            {t('coolify.refresh')}
          </Button>
        </div>
        {inventory.status === 'ready' && (
          <p className="text-xs text-muted-foreground">
            {t('coolify.lastUpdate', {
              time: inventory.checkedAt
                ? formatDateTime(inventory.checkedAt)
                : t('connections.notReported'),
            })}{' '}
            · {t('coolify.scopeNote')}
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {inventory.status === 'loading' ? (
          <RowListSkeleton label={t('coolify.loading')} />
        ) : inventory.status === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{inventory.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                {t('coolify.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : resources.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="font-label text-lg">{t('coolify.empty')}</EmptyTitle>
              <EmptyDescription>{t('coolify.emptyHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle className="font-label text-lg">{t('coolify.noMatch')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                {t('coolify.selected', { count: chosen.length })}
              </span>
              <Button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => setCreating(chosen)}
              >
                {t('coolify.createSelected', { count: chosen.length })}
              </Button>
            </div>
            <CoolifyResourceTable
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
        <CoolifyLinkDialog
          connectionId={connection.id}
          resource={linking}
          cards={cards}
          links={links}
          onClose={() => setLinking(null)}
          onDone={() => void reloadSide()}
        />
      )}
      {creating && (
        <CoolifyDiscovery
          connectionId={connection.id}
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
