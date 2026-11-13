import type { DatabaseSync } from 'node:sqlite';
import {
  isLinkColor,
  LINK_TYPES_MAX,
  normalizeLinkTypeName,
  validateServiceLinks,
  type LinkColor,
  type LinkType,
  type LinkTypeUsage,
  type ServiceLink,
} from '@homora/shared';

/** The extra addresses sent with a card are invalid, or point to a type that does not exist. */
export class ServiceLinkError extends Error {
  readonly code = 'invalid-links' as const;
  constructor() {
    super('Provide valid extra addresses.');
    this.name = 'ServiceLinkError';
  }
}

export type LinkTypeFailure =
  'invalid-link-type' | 'link-type-exists' | 'link-type-limit' | 'link-type-not-found';
type Result<T> = { ok: true; value: T } | { ok: false; code: LinkTypeFailure };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: LinkTypeFailure): Result<never> => ({ ok: false, code });

type LinkRow = {
  id: number;
  serviceId: number;
  name: string;
  url: string;
  openTarget: string | null;
  typeId: number | null;
  typeName: string | null;
  typeColor: string | null;
};

/**
 * Owns the extra addresses of services and the link types they use. Writes happen inside the
 * caller's transaction (`writeLinks`) so a card and its addresses are saved together; type
 * operations run their own.
 */
export function createServiceLinkConfiguration(
  sqlite: DatabaseSync,
  { transaction }: { transaction: <T>(work: () => T) => T },
) {
  const toLink = (row: LinkRow): ServiceLink => ({
    id: row.id,
    url: row.url,
    name: row.name,
    openTarget:
      row.openTarget === 'new-tab' || row.openTarget === 'same-tab' ? row.openTarget : null,
    type:
      row.typeId !== null && row.typeName !== null && isLinkColor(row.typeColor)
        ? { id: row.typeId, name: row.typeName, color: row.typeColor }
        : null,
  });
  const linkQuery = `SELECT l.id,l.service_id AS serviceId,l.name,l.url,l.open_target AS openTarget,
      l.type_id AS typeId,t.name AS typeName,t.color AS typeColor
    FROM service_links l LEFT JOIN link_types t ON t.id=l.type_id`;

  const findType = (id: number) =>
    sqlite.prepare('SELECT id,name,color FROM link_types WHERE id=?').get(id) as
      LinkType | undefined;
  const typeCount = () =>
    (sqlite.prepare('SELECT COUNT(*) AS n FROM link_types').get() as { n: number }).n;
  const nameTaken = (name: string, exceptId?: number) =>
    Boolean(
      sqlite
        .prepare('SELECT id FROM link_types WHERE name=? COLLATE NOCASE AND id IS NOT ?')
        .get(name, exceptId ?? null),
    );
  const insertType = (name: string, color: LinkColor): LinkType => {
    const created = sqlite
      .prepare(
        'INSERT INTO link_types(name,color,position) VALUES(?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM link_types))',
      )
      .run(name, color);
    return { id: Number(created.lastInsertRowid), name, color };
  };

  return {
    /** Extra addresses of every service, in order. */
    selectLinks(): Map<number, ServiceLink[]> {
      const rows = sqlite
        .prepare(`${linkQuery} ORDER BY l.service_id,l.position,l.id`)
        .all() as unknown as LinkRow[];
      const byService = new Map<number, ServiceLink[]>();
      for (const row of rows) {
        const list = byService.get(row.serviceId) ?? [];
        list.push(toLink(row));
        byService.set(row.serviceId, list);
      }
      return byService;
    },
    selectServiceLinks(serviceId: number): ServiceLink[] {
      return (
        sqlite
          .prepare(`${linkQuery} WHERE l.service_id=? ORDER BY l.position,l.id`)
          .all(serviceId) as unknown as LinkRow[]
      ).map(toLink);
    },
    /**
     * Replaces the addresses of a card. Call inside a transaction. Throws `ServiceLinkError` when
     * the list is invalid, too long or names a missing type; nothing is written then.
     */
    writeLinks(serviceId: number, raw: unknown) {
      const links = validateServiceLinks(raw);
      if (!links) throw new ServiceLinkError();
      for (const link of links)
        if (link.typeId !== null && !findType(link.typeId)) throw new ServiceLinkError();
      sqlite.prepare('DELETE FROM service_links WHERE service_id=?').run(serviceId);
      const insert = sqlite.prepare(
        'INSERT INTO service_links(service_id,type_id,name,url,open_target,position) VALUES(?,?,?,?,?,?)',
      );
      links.forEach((link, position) =>
        insert.run(serviceId, link.typeId, link.name, link.url, link.openTarget, position),
      );
    },
    listTypes(): LinkTypeUsage[] {
      return sqlite
        .prepare(
          `SELECT t.id,t.name,t.color,(SELECT COUNT(*) FROM service_links l WHERE l.type_id=t.id) AS uses
           FROM link_types t ORDER BY t.position,t.id`,
        )
        .all() as unknown as LinkTypeUsage[];
    },
    /**
     * The id of the type called `rawName`, creating it with `color` when missing and there is room.
     * Used by imports, which reuse a local type (keeping its color) instead of overwriting it.
     * Call inside a transaction. `null` means the name is invalid or the limit was reached.
     */
    ensureType(rawName: unknown, color: unknown): number | null {
      const name = normalizeLinkTypeName(rawName);
      if (!name) return null;
      const existing = sqlite
        .prepare('SELECT id FROM link_types WHERE name=? COLLATE NOCASE')
        .get(name) as { id: number } | undefined;
      if (existing) return existing.id;
      if (typeCount() >= LINK_TYPES_MAX) return null;
      return insertType(name, isLinkColor(color) ? color : 'neutral').id;
    },
    createType(rawName: unknown, color: unknown): Result<LinkType> {
      const name = normalizeLinkTypeName(rawName);
      if (!name || !isLinkColor(color)) return fail('invalid-link-type');
      return transaction(() => {
        if (typeCount() >= LINK_TYPES_MAX) return fail('link-type-limit');
        if (nameTaken(name)) return fail('link-type-exists');
        return ok(insertType(name, color));
      });
    },
    updateType(id: number, patch: { name?: unknown; color?: unknown }): Result<LinkType> {
      const name = patch.name === undefined ? undefined : normalizeLinkTypeName(patch.name);
      if (name === null || (patch.color !== undefined && !isLinkColor(patch.color)))
        return fail('invalid-link-type');
      return transaction(() => {
        const current = findType(id);
        if (!current) return fail('link-type-not-found');
        const next = name ?? current.name;
        if (nameTaken(next, id)) return fail('link-type-exists');
        const color = (patch.color as LinkColor | undefined) ?? current.color;
        sqlite.prepare('UPDATE link_types SET name=?,color=? WHERE id=?').run(next, color, id);
        return ok({ id, name: next, color });
      });
    },
    /** Deleting a type keeps the addresses that used it; they just lose the type. */
    removeType(id: number): Result<{ uses: number }> {
      return transaction(() => {
        if (!findType(id)) return fail('link-type-not-found');
        const uses = (
          sqlite.prepare('SELECT COUNT(*) AS n FROM service_links WHERE type_id=?').get(id) as {
            n: number;
          }
        ).n;
        sqlite.prepare('DELETE FROM link_types WHERE id=?').run(id);
        return ok({ uses });
      });
    },
  };
}
export type ServiceLinkConfiguration = ReturnType<typeof createServiceLinkConfiguration>;
