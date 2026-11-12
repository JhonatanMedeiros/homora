import { useMemo, useState } from 'react';
import type { HostLink } from '@homora/shared';
import { Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { EmptyNote } from '@/components/empty-note';
import { FormError } from '@/components/form-error';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/use-mobile';
import { findGuest, type HostConnection, type HostInventories } from '@/lib/hosts';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

type Props = {
  value: HostLink | null;
  onChange: (value: HostLink | null) => void;
  connections: HostConnection[];
  connectionsLoaded: boolean;
  inventories: HostInventories;
  onReload: (connectionId: number, refresh?: boolean) => void;
};

/** "Runs on" section of the service form: connection → node → guest, in a bottom sheet on phones. */
export function HostPicker({
  value,
  onChange,
  connections,
  connectionsLoaded,
  inventories,
  onReload,
}: Props) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [node, setNode] = useState('');
  const [query, setQuery] = useState('');
  const activeId = connectionId ?? value?.connectionId ?? connections[0]?.id ?? null;
  const inventory = activeId === null ? undefined : inventories[activeId];
  const current = value ? findGuest(inventories[value.connectionId], value) : undefined;
  const currentConnection = value && connections.find((item) => item.id === value.connectionId);
  const guests = useMemo(() => {
    if (inventory?.status !== 'ready') return [];
    const needle = query.trim().toLowerCase();
    return inventory.guests.filter(
      (guest) =>
        (!node || guest.node === node) &&
        (!needle ||
          guest.name.toLowerCase().includes(needle) ||
          String(guest.vmid).includes(needle)),
    );
  }, [inventory, node, query]);

  let summary = t('hosts.none');
  if (value) {
    if (current)
      summary = `${current.name || current.vmid} · ${t('hosts.on', { node: current.node })}`;
    else if (inventories[value.connectionId]?.status === 'ready') summary = t('hosts.notFound');
    else
      summary = `${t(`hosts.type.${value.type}`)} ${value.vmid} · ${t('hosts.on', { node: value.node })}`;
  }

  function start() {
    setConnectionId(value?.connectionId ?? connections[0]?.id ?? null);
    setNode(value?.node ?? '');
    setQuery('');
    setOpen(true);
    const id = value?.connectionId ?? connections[0]?.id;
    if (id !== undefined && !inventories[id]) onReload(id);
  }
  function pick(guest: { vmid: number; type: 'qemu' | 'lxc'; node: string }) {
    if (activeId === null) return;
    onChange({ connectionId: activeId, node: guest.node, vmid: guest.vmid, type: guest.type });
    setOpen(false);
  }

  return (
    <Field className="sm:col-span-2">
      <FieldLabel id="service-host-label">{t('hosts.runsOn')}</FieldLabel>
      {connectionsLoaded && connections.length === 0 && !value ? (
        <FieldDescription>{t('hosts.noConnections')}</FieldDescription>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-labelledby="service-host-label"
              className={cn(
                'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-3 text-sm pointer-coarse:min-h-11',
                !value && 'text-muted-foreground',
              )}
            >
              <Server className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{summary}</span>
              {currentConnection && connections.length > 1 && (
                <small className="shrink-0 text-muted-foreground">{currentConnection.name}</small>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-11"
              disabled={connections.length === 0}
              onClick={start}
            >
              {value ? t('hosts.change') : t('hosts.choose')}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                className="pointer-coarse:h-11"
                onClick={() => onChange(null)}
              >
                {t('hosts.unlink')}
              </Button>
            )}
          </div>
          <FieldDescription>
            {value && inventories[value.connectionId]?.status === 'ready' && !current
              ? t('hosts.notFoundHint')
              : t('hosts.runsOnHint')}
          </FieldDescription>
        </>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className={cn('gap-4', mobile && 'max-h-[85dvh]')}
        >
          <SheetHeader>
            <SheetTitle>{t('hosts.sheetTitle')}</SheetTitle>
            <SheetDescription>{t('hosts.sheetDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
            {connections.length > 1 && (
              <Field>
                <FieldLabel htmlFor="host-connection">{t('hosts.connection')}</FieldLabel>
                <FormSelect
                  id="host-connection"
                  aria-label={t('hosts.connection')}
                  value={activeId ?? ''}
                  onChange={(event) => {
                    const id = Number(event.target.value);
                    setConnectionId(id);
                    setNode('');
                    if (!inventories[id]) onReload(id);
                  }}
                >
                  {connections.map((connection) => (
                    <FormSelectOption key={connection.id} value={connection.id}>
                      {connection.name}
                    </FormSelectOption>
                  ))}
                </FormSelect>
              </Field>
            )}
            {inventory?.status === 'ready' && (
              <Field>
                <FieldLabel htmlFor="host-node">{t('hosts.node')}</FieldLabel>
                <FormSelect
                  id="host-node"
                  aria-label={t('hosts.node')}
                  value={node}
                  onChange={(event) => setNode(event.target.value)}
                >
                  <FormSelectOption value="">{t('hosts.allNodes')}</FormSelectOption>
                  {inventory.nodes.map((item) => (
                    <FormSelectOption key={item.name} value={item.name}>
                      {item.name}
                    </FormSelectOption>
                  ))}
                </FormSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="host-search">{t('hosts.search')}</FieldLabel>
              <Input
                id="host-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('hosts.searchPlaceholder')}
              />
            </Field>
            <div role="status" className="empty:hidden">
              {inventory?.status === 'loading' && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> {t('hosts.loading')}
                </p>
              )}
            </div>
            {inventory?.status === 'error' && (
              <div className="flex flex-col items-start gap-2">
                <FormError>{t('hosts.loadError')}</FormError>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => activeId !== null && onReload(activeId, true)}
                >
                  {t('hosts.retry')}
                </Button>
              </div>
            )}
            {inventory?.status === 'ready' &&
              (guests.length === 0 ? (
                <EmptyNote>{t('hosts.noGuests')}</EmptyNote>
              ) : (
                <ul
                  aria-label={t('hosts.guests')}
                  className="flex min-h-0 flex-col gap-1 overflow-y-auto"
                >
                  {guests.map((guest) => {
                    const selected =
                      value?.connectionId === activeId &&
                      value.node === guest.node &&
                      value.vmid === guest.vmid &&
                      value.type === guest.type;
                    return (
                      <li key={`${guest.node}:${guest.type}:${guest.vmid}`}>
                        <Button
                          type="button"
                          variant={selected ? 'secondary' : 'ghost'}
                          aria-pressed={selected}
                          className="h-auto min-h-11 w-full justify-between gap-3 py-2 text-left"
                          onClick={() => pick(guest)}
                        >
                          <span className="min-w-0 truncate">
                            {guest.name || t(`hosts.type.${guest.type}`)}
                            <small className="block font-mono text-xs font-normal text-muted-foreground">
                              {guest.vmid} · {t(`hosts.type.${guest.type}`)} · {guest.node}
                            </small>
                          </span>
                          <small className="shrink-0 text-muted-foreground">
                            {guest.status === 'running'
                              ? t('hosts.state.running')
                              : guest.status === 'stopped'
                                ? t('hosts.state.stopped')
                                : t('hosts.state.other')}
                          </small>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </Field>
  );
}
