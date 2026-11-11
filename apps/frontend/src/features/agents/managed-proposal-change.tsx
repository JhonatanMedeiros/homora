import { t, type MessageKey } from '@/i18n';
import type { Diff } from './agent-model';

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
};
const operations: Record<string, MessageKey> = {
  create: 'managed.create',
  rename: 'managed.rename',
  delete: 'managed.delete',
  reorder: 'managed.reorder',
  move: 'managed.move',
  link: 'managed.link',
};
function Value({ value, field }: { value: unknown; field?: string }) {
  if (value == null) return <span>{t('proposal.empty')}</span>;
  if (Array.isArray(value))
    return value.length ? (
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
  if (field === 'op' && typeof value === 'string' && operations[value])
    return <span>{t(operations[value])}</span>;
  return <span>{String(value)}</span>;
}
export function ManagedProposalChange({ diff }: { diff: Diff }) {
  const kind = diff.change?.kind;
  const title =
    kind === 'group'
      ? 'proposal.managed.group'
      : kind === 'card-order'
        ? 'proposal.managed.card-order'
        : kind === 'widget'
          ? 'proposal.managed.widget'
          : 'proposal.managed.connection-setup';
  return (
    <div className="flex flex-col gap-3">
      <p className="font-label text-lg font-semibold">{t(title)}</p>
      {kind === 'connection-setup' && <p>{t('proposal.managed.connectionNote')}</p>}
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
