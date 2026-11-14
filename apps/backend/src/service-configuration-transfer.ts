import { clockWidget } from '@homora/widgets/clock';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { integrationDefinition } from '@homora/integrations';
import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_PAGES,
  validateService,
  type CheckType,
  type Service,
  type ServiceLink,
} from '@homora/shared';
import {
  planImport,
  type ImportPlan,
  type ParsedImport,
  type PortableWidget,
} from './transfer/index.js';

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
  selectLinks,
  writeLinks,
  ensureType,
}: {
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  selectServices: () => ServiceRow[];
  selectGroups: () => Group[];
  ensureGroup: (name: string, columns?: number | null, pageId?: number) => void;
  nextServicePosition: (category: string) => number;
  bumpVersion: () => void;
  selectLinks: () => Map<number, ServiceLink[]>;
  writeLinks: (id: number, links: unknown) => void;
  ensureType: (name: unknown, color: unknown) => number | null;
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
        widgets: (
          sqlite
            .prepare(
              `SELECT w.type,w.name,w.config,p.name AS page,c.name AS sourceName FROM page_widgets w JOIN pages p ON p.id=w.page_id LEFT JOIN integration_instances c ON c.id=w.connection_id WHERE w.version=1 ORDER BY p.position,w.position,w.id`,
            )
            .all() as {
            type: string;
            name: string;
            config: string;
            page: string;
            sourceName: string | null;
          }[]
        ).flatMap<PortableWidget>((row) => {
          let raw: unknown;
          try {
            raw = JSON.parse(row.config);
          } catch {
            return [];
          }
          if (row.type === 'clock') {
            const config = clockWidget.parseConfig(raw);
            return config ? [{ page: row.page, type: row.type, name: row.name, config }] : [];
          }
          if (!integrationDefinition(row.type) || row.sourceName === null) return [];
          return [
            {
              page: row.page,
              type: row.type,
              name: row.name,
              config: {},
              source: { type: row.type, name: row.sourceName },
            },
          ];
        }),
        groups: selectGroups().map((group) => ({
          ...group,
          page: group.pageId === null ? undefined : pageNames.get(group.pageId),
        })),
        services: (() => {
          const links = selectLinks();
          const pins = new Set(
            (
              sqlite.prepare('SELECT service_id AS id FROM service_pins').all() as { id: number }[]
            ).map((row) => row.id),
          );
          return selectServices().map((row) => ({
            ...row,
            pinned: pins.has(row.id),
            allowPrivate: Boolean(row.allowPrivate),
            links: links.get(row.id) ?? [],
          })) as Service[];
        })(),
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
          widgetCount: (
            sqlite.prepare('SELECT COUNT(*) AS n FROM page_widgets').get() as { n: number }
          ).n,
          groups: selectGroups().map((group) => group.name),
          services: rows.map((row) => ({ category: row.category, url: row.url, alias: row.alias })),
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
    ):
      | { status: 'stale' }
      | { status: 'applied'; plan: ImportPlan; created: number; widgetsCreated: number } {
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
          widgetCount: (
            sqlite.prepare('SELECT COUNT(*) AS n FROM page_widgets').get() as { n: number }
          ).n,
          groups: selectGroups().map((group) => group.name),
          services: selectServices().map((row) => ({
            category: row.category,
            url: row.url,
            alias: row.alias,
          })),
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
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,check_url,check_match,open_target,alias) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
          const inserted = insert.run(
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
            valid.checkUrl ?? null,
            valid.checkMatch ?? null,
            valid.openTarget ?? 'new-tab',
            plan.services[index].alias ?? null,
          );
          if (service.pinned)
            sqlite
              .prepare('INSERT OR IGNORE INTO service_pins(service_id,pinned_at) VALUES(?,?)')
              .run(Number(inserted.lastInsertRowid), Date.now());
          if (service.links?.length)
            writeLinks(
              Number(inserted.lastInsertRowid),
              service.links.map((link) => ({
                url: link.url,
                name: link.name,
                openTarget: link.openTarget ?? null,
                typeId: link.type ? ensureType(link.type.name, link.type.color) : null,
              })),
            );
          created += 1;
        });
        let widgetsCreated = 0;
        for (const [index, widget] of (parsed.document.widgets ?? []).entries()) {
          if (plan.widgets[index]?.status !== 'new') continue;
          const pageId = options.pageId ?? pageIds.get(widget.page.toLocaleLowerCase());
          if (!pageId) continue;
          const onPage = (
            sqlite
              .prepare('SELECT COUNT(*) AS n FROM page_widgets WHERE page_id=?')
              .get(pageId) as {
              n: number;
            }
          ).n;
          // A page holds a limited number of widgets; the rest of the file's widgets are skipped.
          if (onPage >= MAX_WIDGETS_PER_PAGE) continue;
          sqlite
            .prepare(
              'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,position) VALUES(?,?,?,?,1,NULL,(SELECT COALESCE(MAX(position),-1)+1 FROM page_widgets WHERE page_id=?))',
            )
            .run(pageId, widget.type, widget.name, JSON.stringify(widget.config), pageId);
          widgetsCreated += 1;
        }
        if (created || widgetsCreated) bumpVersion();
        return { status: 'applied' as const, plan, created, widgetsCreated };
      });
    },
  };
}
