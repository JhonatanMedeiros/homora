import { formatDateTime, t, type MessageKey } from '@/i18n';
import type { Diff } from './agent-model';
import { MaintenanceReview } from '@/features/uptime/maintenance-review';

const labels: Record<string, MessageKey> = {
  op: 'managed.op',
  id: 'managed.id',
  name: 'field.name',
  names: 'managed.names',
  category: 'field.category',
  ids: 'managed.ids',
  targetCategory: 'managed.targetCategory',
  sourceIds: 'managed.sourceIds',
  targetIds: 'managed.targetIds',
  integrationId: 'managed.integrationId',
  integration_id: 'managed.integrationId',
  serviceId: 'managed.serviceId',
  pageId: 'managed.pageId',
  moveTo: 'managed.moveTo',
  probe: 'managed.probe',
  address: 'managed.address',
  tags: 'managed.tags',
  incidentId: 'managed.incidentId',
  muteMinutes: 'managed.muteMinutes',
  resourceUuid: 'managed.resourceUuid',
  resourceType: 'managed.resourceType',
  pinned: 'managed.pinned',
  order: 'managed.order',
  startsAt: 'managed.startsAt',
  endsAt: 'managed.endsAt',
  note: 'managed.note',
  service_id: 'managed.serviceId',
  type: 'managed.type',
  url: 'field.url',
  entityId: 'managed.entityId',
  username: 'managed.username',
  slug: 'managed.slug',
  groups: 'managed.groups',
  services: 'managed.services',
  widgets: 'managed.widgets',
  connections: 'managed.connections',
  position: 'field.position',
  columns: 'managed.columns',
  host: 'managed.host',
  strength: 'managed.strength',
  evidence: 'managed.evidence',
  connectionId: 'managed.connectionId',
  node: 'hosts.node',
  vmid: 'managed.vmid',
  host_connection_id: 'managed.connectionId',
  host_node: 'hosts.node',
  host_vmid: 'managed.vmid',
  host_type: 'managed.type',
};
const operations: Record<string, MessageKey> = {
  create: 'managed.create',
  rename: 'managed.rename',
  delete: 'managed.delete',
  cancel: 'managed.cancel',
  reorder: 'managed.reorder',
  move: 'managed.move',
  'page-create': 'managed.pageCreate',
  'page-delete': 'managed.pageDelete',
  link: 'managed.link',
  unlink: 'managed.unlink',
  pin: 'managed.pin',
  unpin: 'managed.unpin',
  ack: 'managed.ack',
  clear: 'managed.clear',
  'assign-group': 'managed.assignGroup',
};
function Value({ value, field }: { value: unknown; field?: string }) {
  if (value == null) return <span>{t('proposal.empty')}</span>;
  if (Array.isArray(value))
    return value.length > 0 ? (
      <ol className="flex list-decimal flex-col gap-2 pl-6">
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <span>{t('proposal.empty')}</span>
    );
  if (typeof value === 'object')
    return (
      <dl className="flex flex-col gap-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm font-semibold">{labels[key] ? t(labels[key]) : key}</dt>
            <dd className="break-words">
              <Value value={item} field={key} />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (field === 'strength' && (value === 'strong' || value === 'medium'))
    return <span>{t(`hosts.strength.${value}`)}</span>;
  if ((field === 'startsAt' || field === 'endsAt') && typeof value === 'number')
    return <span>{formatDateTime(value)}</span>;
  if (field === 'op' && typeof value === 'string' && operations[value])
    return <span>{t(operations[value])}</span>;
  return <span>{String(value)}</span>;
}
/** Spells out the effect — private → public — and what anonymous visitors would see. */
function PublicVisibilityNote({ diff }: { diff: Diff }) {
  const next = (diff.change?.change as { isPublic?: boolean } | undefined)?.isPublic === true;
  const before = diff.before as { monitor?: { name?: string; isPublic?: number | boolean } | null };
  const current = Boolean(before?.monitor?.isPublic);
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <p className="font-semibold">
        {before?.monitor?.name ? `${before.monitor.name}: ` : ''}
        {t(current ? 'managed.visibility.public' : 'managed.visibility.private')}
        {' → '}
        {t(next ? 'managed.visibility.public' : 'managed.visibility.private')}
      </p>
      {next && <p>{t('managed.visibility.exposure')}</p>}
    </div>
  );
}
export function ManagedProposalChange({ diff }: { diff: Diff }) {
  const kind = diff.change?.kind;
  const maintenance =
    kind === 'maintenance' && diff.change?.change && typeof diff.change.change === 'object'
      ? (diff.change.change as {
          serviceId?: unknown;
          startsAt?: unknown;
          endsAt?: unknown;
          op?: unknown;
          id?: unknown;
        })
      : null;
  const title =
    kind === 'pin'
      ? 'proposal.managed.pin'
      : kind === 'link'
        ? 'proposal.managed.link'
        : kind === 'acknowledgement'
          ? 'proposal.managed.acknowledgement'
          : kind === 'tag'
            ? 'proposal.managed.tag'
            : kind === 'probe'
              ? 'proposal.managed.probe'
              : kind === 'page'
                ? 'proposal.managed.page'
                : kind === 'group'
                  ? 'proposal.managed.group'
                  : kind === 'card-order'
                    ? 'proposal.managed.card-order'
                    : kind === 'widget'
                      ? 'proposal.managed.widget'
                      : kind === 'maintenance'
                        ? 'proposal.managed.maintenance'
                        : kind === 'host-link'
                          ? 'proposal.managed.host-link'
                          : kind === 'public-visibility'
                            ? 'proposal.managed.public-visibility'
                            : kind === 'connection-delete'
                              ? 'proposal.managed.connection-delete'
                              : 'proposal.managed.connection-setup';
  return (
    <div className="flex flex-col gap-3">
      <p className="font-label text-lg font-semibold">{t(title)}</p>
      {kind === 'connection-setup' && <p>{t('proposal.managed.connectionNote')}</p>}
      {kind === 'host-link' && <p>{t('managed.hostNote')}</p>}
      {kind === 'maintenance' && <p>{t('managed.maintenanceNote')}</p>}
      {maintenance &&
        Number.isSafeInteger(maintenance.serviceId) &&
        Number(maintenance.serviceId) > 0 && (
          <MaintenanceReview
            serviceId={Number(maintenance.serviceId)}
            startsAt={typeof maintenance.startsAt === 'number' ? maintenance.startsAt : undefined}
            endsAt={typeof maintenance.endsAt === 'number' ? maintenance.endsAt : undefined}
            excludeId={
              maintenance.op === 'cancel' && typeof maintenance.id === 'number'
                ? maintenance.id
                : undefined
            }
          />
        )}
      {kind === 'public-visibility' && <PublicVisibilityNote diff={diff} />}
      {diff.before != null && (
        <section className="flex flex-col gap-2">
          <p className="font-semibold">{t('proposal.before')}</p>
          <div className="rounded-md bg-muted p-3">
            <Value value={diff.before} />
          </div>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <p className="font-semibold">{t('proposal.managed.details')}</p>
        <div className="rounded-md border p-3">
          <Value value={diff.change?.change} />
        </div>
      </section>
    </div>
  );
}
