import { toast } from 'sonner';
import { useState } from 'react';
import type { HostLink, Service } from '@homora/shared';
import type { HostViewModel } from '@/features/hosts/hosts';
import { t } from '@/i18n';

/** Write access. The map disables it on phones and when no edit context was supplied. */
export type MapEdit = {
  onLinkHost: (service: Service, host: HostLink | null) => Promise<boolean>;
  /** Marks a card that is not linked as "not running on a guest" (or moves it back). */
  onMarkExternal: (service: Service, external: boolean) => Promise<boolean>;
  onAddDependency: (serviceId: number, dependsOnId: number) => Promise<string | null>;
  onRemoveDependency: (serviceId: number, dependsOnId: number) => Promise<string | null>;
  connectionsLoaded: boolean;
  onReload: (connectionId: number, refresh?: boolean) => void;
};

type Options = {
  edit?: MapEdit;
  services: Service[];
  model: HostViewModel;
};

/** Coordinates host-link and dependency edits initiated from the map or selection panel. */
export function useHostMapEditing({ edit, services, model }: Options) {
  const [picking, setPicking] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const nameOf = (id: number) => services.find((item) => item.id === id)?.name ?? `#${id}`;

  async function link(service: Service, host: HostLink | null, guestName = '') {
    if (!edit) return;
    const ok = await edit.onLinkHost(service, host);
    const feedback = ok
      ? host
        ? t('map.linked', {
            name: service.name,
            guest: guestName || String(host.vmid),
          })
        : t('map.unlinked', { name: service.name })
      : t('map.linkFailed');
    if (ok) toast.success(feedback);
    else {
      setMessage(feedback);
      toast.error(feedback);
    }
  }

  /** Links several services; the toast offers one Undo that unlinks only the ones that worked. */
  async function linkMany(items: { service: Service; host: HostLink }[]) {
    if (!edit) return;
    const done: Service[] = [];
    for (const item of items)
      if (await edit.onLinkHost(item.service, item.host)) done.push(item.service);
    if (done.length < items.length) {
      setMessage(t('map.linkFailed'));
      toast.error(t('map.linkFailed'));
    }
    if (done.length === 0) return;
    toast.success(t('map.suggest.linkedMany', { count: done.length }), {
      action: {
        label: t('map.undo'),
        onClick: () => {
          for (const service of done) void edit.onLinkHost(service, null);
        },
      },
    });
  }

  async function markExternal(service: Service, external: boolean) {
    if (!edit) return;
    if (!(await edit.onMarkExternal(service, external))) {
      setMessage(t('map.linkFailed'));
      toast.error(t('map.linkFailed'));
      return;
    }
    toast.success(
      t(external ? 'map.external.marked' : 'map.external.unmarked', {
        name: service.name,
      }),
      {
        action: {
          label: t('map.undo'),
          onClick: () => void edit.onMarkExternal(service, !external),
        },
      },
    );
  }

  async function pick(service: Service, dependsOnId: number) {
    if (!edit) return;
    setPicking(null);
    const failure = await edit.onAddDependency(service.id, dependsOnId);
    const feedback =
      failure ??
      t('dependencies.added', {
        name: service.name,
        other: nameOf(dependsOnId),
      });
    if (failure) {
      setMessage(feedback);
      toast.error(feedback);
    } else toast.success(feedback);
  }

  async function unpick(serviceId: number, dependsOnId: number) {
    if (!edit) return;
    const failure = await edit.onRemoveDependency(serviceId, dependsOnId);
    const feedback =
      failure ??
      t('dependencies.removed', {
        name: nameOf(serviceId),
        other: nameOf(dependsOnId),
      });
    if (failure) {
      setMessage(feedback);
      toast.error(feedback);
    } else toast.success(feedback);
  }

  const panelRunsOn = (service: Service) => {
    const found = model.nodes
      .flatMap((node) => node.guests.map((group) => ({ node, group })))
      .find((entry) => entry.group.services.some((item) => item.id === service.id));
    return found
      ? `${found.group.guest.name || found.group.guest.vmid} · ${t('hosts.on', { node: found.node.node.name })}`
      : service.host
        ? t('hosts.notFound')
        : t('hosts.none');
  };

  const guestName = (host: HostLink | null) =>
    host
      ? (model.nodes
          .flatMap((node) => node.guests)
          .find((group) => group.guest.vmid === host.vmid && group.guest.type === host.type)?.guest
          .name ?? '')
      : '';

  return {
    picking,
    setPicking,
    message,
    nameOf,
    link,
    linkMany,
    markExternal,
    pick,
    unpick,
    panelRunsOn,
    guestName,
  };
}
