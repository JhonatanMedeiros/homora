import type { DatabaseSync } from 'node:sqlite';
import { hasInventoryDomain } from '@homora/integrations';
import type { ResourceType, ResourceLink } from '@homora/integrations';

export class ResourceLinkError extends Error {
  constructor(readonly code: 'service-not-found' | 'integration-not-found' | 'invalid-data') {
    super(code);
    this.name = 'ResourceLinkError';
  }
}

export type ResourceLinkInput = {
  integrationId: number;
  resourceUuid: string;
  resourceType: ResourceType;
  name: string;
  url: string | null;
};

type Row = {
  id: number;
  service_id: number;
  integration_id: number;
  resource_uuid: string;
  resource_type: string;
  seen_name: string;
  seen_url: string | null;
};

const toLink = (row: Row): ResourceLink => ({
  id: row.id,
  serviceId: row.service_id,
  integrationId: row.integration_id,
  resourceUuid: row.resource_uuid,
  resourceType: row.resource_type === 'service' ? 'service' : 'application',
  seenName: row.seen_name,
  seenUrl: row.seen_url,
});

/**
 * Links between cards and external resources, keyed by connection and resource UUID, never by name.
 * Homora's own data: nothing here calls external services. `seenName`/`seenUrl` hold what the user last
 * reviewed, so a later change in the external service is flagged and never applied to the card automatically.
 * A card has one link; setting it again is how the user accepts a reviewed change.
 */
export function createResourceLinks(sqlite: DatabaseSync, now: () => number = Date.now) {
  const select = 'SELECT * FROM integration_resource_links';
  return {
    list(): ResourceLink[] {
      return (sqlite.prepare(`${select} ORDER BY id`).all() as Row[]).map(toLink);
    },
    set(serviceId: number, input: ResourceLinkInput): ResourceLink {
      if (!sqlite.prepare('SELECT id FROM services WHERE id=?').get(serviceId))
        throw new ResourceLinkError('service-not-found');
      const connection = sqlite
        .prepare('SELECT type FROM integration_instances WHERE id=?')
        .get(input.integrationId) as { type: string } | undefined;
      if (!connection) throw new ResourceLinkError('integration-not-found');
      if (!hasInventoryDomain(connection.type, 'resources'))
        throw new ResourceLinkError('invalid-data');
      sqlite
        .prepare(
          `INSERT INTO integration_resource_links
             (service_id, integration_id, resource_uuid, resource_type, seen_name, seen_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(service_id) DO UPDATE SET
             integration_id=excluded.integration_id, resource_uuid=excluded.resource_uuid,
             resource_type=excluded.resource_type, seen_name=excluded.seen_name,
             seen_url=excluded.seen_url`,
        )
        .run(
          serviceId,
          input.integrationId,
          input.resourceUuid,
          input.resourceType,
          input.name,
          input.url,
          now(),
        );
      return toLink(sqlite.prepare(`${select} WHERE service_id=?`).get(serviceId) as Row);
    },
    remove(serviceId: number): boolean {
      return (
        sqlite.prepare('DELETE FROM integration_resource_links WHERE service_id=?').run(serviceId)
          .changes > 0
      );
    },
  };
}
