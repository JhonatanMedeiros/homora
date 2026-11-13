import type { DatabaseSync } from 'node:sqlite';
import { MAX_PAGES, validateService, type CheckType, type Service } from '@homora/shared';
import { planImport, type ImportPlan, type ParsedImport } from './config-transfer.js';

type ServiceRow = Omit<Service, 'position' | 'allowPrivate' | 'checkType' | 'checkInterval'> & {
  position: number;
  allowPrivate: number | boolean;
  checkType: CheckType;
  checkInterval: number | null;
};

type Group = {
  id: number;
  name: string;
  position: number;
  columns: number | null;
  pageId: number | null;
};

export function createConfigurationTransfer({
  sqlite,
  transaction,
  selectServices,
  selectGroups,
  ensureGroup,
  nextServicePosition,
  bumpVersion,
}: {
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  selectServices: () => ServiceRow[];
  selectGroups: () => Group[];
  ensureGroup: (name: string, columns?: number | null, pageId?: number) => void;
  nextServicePosition: (category: string) => number;
  bumpVersion: () => void;
}) {
  return {
    /** Groups and cards in current order, for export. */
    exportData() {
      const pageNames = new Map(
        (
          sqlite.prepare('SELECT id,name FROM pages ORDER BY position,id').all() as {
            id: number;
            name: string;
          }[]
        ).map((row) => [row.id, row.name]),
      );
      return {
        pages: [...pageNames.values()],
        groups: selectGroups().map((group) => ({
          ...group,
          page: group.pageId === null ? undefined : pageNames.get(group.pageId),
        })),
        services: selectServices().map((row) => ({
          ...row,
          allowPrivate: Boolean(row.allowPrivate),
        })) as Service[],
      };
    },
    /** Previews an import without persisting anything. */
    previewImport(parsed: ParsedImport) {
      const rows = selectServices();
      return {
        version: (
          sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as {
            version: number;
          }
        ).version,
        plan: planImport(parsed, {
          groups: selectGroups().map((group) => group.name),
          services: rows.map((row) => ({ category: row.category, url: row.url })),
          pages: (
            sqlite.prepare('SELECT id,name FROM pages ORDER BY position,id').all() as {
              id: number;
              name: string;
            }[]
          ).map((page) => page.name),
        }),
      };
    },
    /**
     * Applies an import in a single transaction, recalculating the plan against current
     * state. Only adds groups and cards; private network authorization is retained from the file
     * only if `keepPrivate` is true; `grantPrivate` (explicit choice during review) authorizes all new cards. `expectedVersion` rejects application if configuration
     * changed after the preview.
     */
    applyImport(
      parsed: ParsedImport,
      options: {
        keepPrivate: boolean;
        grantPrivate?: boolean;
        expectedVersion?: number;
        guard?: () => boolean;
        /** Put every new group on this page instead of the pages named in the file. */
        pageId?: number;
      },
    ): { status: 'stale' } | { status: 'applied'; plan: ImportPlan; created: number } {
      return transaction(() => {
        const current = (
          sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as {
            version: number;
          }
        ).version;
        if (
          (options.expectedVersion !== undefined && options.expectedVersion !== current) ||
          (options.guard && !options.guard())
        )
          return { status: 'stale' as const };
        const existingPages = sqlite
          .prepare('SELECT id,name FROM pages ORDER BY position,id')
          .all() as { id: number; name: string }[];
        if (
          options.pageId !== undefined &&
          !existingPages.some((page) => page.id === options.pageId)
        )
          return { status: 'stale' as const };
        const plan = planImport(parsed, {
          groups: selectGroups().map((group) => group.name),
          services: selectServices().map((row) => ({ category: row.category, url: row.url })),
          pages: existingPages.map((page) => page.name),
        });
        // Pages the file asks for are created while there is room; the rest fall back to the first page.
        const pageIds = new Map(
          existingPages.map((page) => [page.name.toLocaleLowerCase(), page.id]),
        );
        if (options.pageId === undefined) {
          let count = existingPages.length;
          for (const page of plan.pages) {
            const key = page.name.toLocaleLowerCase();
            if (pageIds.has(key)) continue;
            if (count >= MAX_PAGES) {
              plan.issues.push({
                path: `pages.${page.name}`,
                code: 'page-limit',
                severity: 'warning',
              });
              continue;
            }
            const created = sqlite
              .prepare(
                'INSERT INTO pages(name,position) VALUES(?,(SELECT COALESCE(MAX(position),-1)+1 FROM pages))',
              )
              .run(page.name);
            pageIds.set(key, Number(created.lastInsertRowid));
            count += 1;
          }
        }
        const insert = sqlite.prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,check_match) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        );
        const queue = parsed.document.groups.flatMap((group) =>
          group.services.map((service) => ({ group: group.name, service })),
        );
        let created = 0;
        const columnsOf = new Map(
          parsed.document.groups.map((group) => [group.name, group.columns ?? null]),
        );
        for (const group of plan.groups)
          ensureGroup(
            group.name,
            columnsOf.get(group.name) ?? null,
            options.pageId ??
              (group.page ? pageIds.get(group.page.toLocaleLowerCase()) : undefined),
          );
        queue.forEach(({ group, service }, index) => {
          if (plan.services[index].status !== 'new') return;
          const valid = validateService({
            ...service,
            category: group,
            allowPrivate:
              options.grantPrivate === true || (options.keepPrivate && service.allowPrivate),
          });
          insert.run(
            valid.name,
            valid.url,
            valid.category,
            valid.description,
            valid.icon ?? '',
            nextServicePosition(valid.category),
            valid.allowPrivate ? 1 : 0,
            valid.checkType ?? 'http',
            valid.checkInterval ?? null,
            valid.expectedStatus ?? null,
            valid.checkPath ?? null,
            valid.checkMatch ?? null,
          );
          created += 1;
        });
        if (created) bumpVersion();
        return { status: 'applied' as const, plan, created };
      });
    },
  };
}
