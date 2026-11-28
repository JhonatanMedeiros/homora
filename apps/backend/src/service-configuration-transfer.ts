import { isPortableWidget } from '@homora/widgets';
import { isSummaryWidgetType } from '@homora/widgets/summary';
import { resolveWidget } from '@homora/integrations';
import { createServiceAttention } from './service-attention.js';
import { createSummaryLayouts } from './summary-layouts.js';
import { createPageWidgetStore, SUMMARY_TYPES_SQL } from './page-widget-store.js';
import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_PAGES,
  validateService,
  type CheckType,
  type Service,
  type ServiceLink,
  type SummaryDesktopItem,
  type SummaryPhoneItem,
} from '@homora/shared';
import {
  planImport,
  type ImportPlan,
  type ParsedImport,
  type PortableSummaryItem,
  type PortableSummaryLayout,
  type PortableWidget,
  summaryWidgetKey,
} from './transfer/index.js';

type ServiceRow = Omit<
  Service,
  'position' | 'allowPrivate' | 'checkInsecure' | 'checkType' | 'checkInterval'
> & {
  position: number;
  allowPrivate: number | boolean;
  checkInsecure: number | boolean;
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
  const widgetStore = createPageWidgetStore(sqlite);
  /** The Summary widgets a page holds, as `summaryWidgetKey`s. */
  const summaryKeysOf = (pageId: number, page: string) =>
    widgetStore
      .list(pageId)
      .flatMap(({ type, name, config }) =>
        isSummaryWidgetType(type)
          ? [summaryWidgetKey(page, { type, name, config: JSON.parse(config) })]
          : [],
      );
  /**
   * How an import treats each page's Summary. A page is untouched while it holds only unnamed
   * Summary widgets without options and no arrangement of its own.
   */
  function summaryState(parsed: ParsedImport, onlyPage?: number) {
    const pages = sqlite.prepare('SELECT id,name FROM pages').all() as {
      id: number;
      name: string;
    }[];
    const touched = new Set(
      (
        sqlite
          .prepare(
            `SELECT page_id AS id FROM page_widgets WHERE type NOT IN (${SUMMARY_TYPES_SQL}) OR name<>'' OR config<>'{}' UNION SELECT page_id FROM summary_layout_items`,
          )
          .all() as { id: number }[]
      ).map((row) => row.id),
    );
    /** Pages whose Summary widgets the file lists, by lower-cased name. */
    const described = new Set(
      parsed.document.hasSummaryWidgets && onlyPage === undefined
        ? (parsed.document.widgets ?? [])
            .filter((widget) => isSummaryWidgetType(widget.type))
            .map((widget) => widget.page.toLocaleLowerCase())
        : [],
    );
    /** Whether the file would leave the page with another set of widgets or arrange them. */
    const changes = (pageId: number, name: string) => {
      const there = (parsed.document.widgets ?? []).flatMap((widget) => {
        const { type } = widget;
        return widget.page.toLocaleLowerCase() === name && isSummaryWidgetType(type)
          ? [summaryWidgetKey(name, { ...widget, type })]
          : [];
      });
      return (
        summaryKeysOf(pageId, name).sort().join() !== there.sort().join() ||
        (parsed.document.summaryLayouts ?? []).some(
          (layout) => layout.page.toLocaleLowerCase() === name,
        )
      );
    };
    const replace: number[] = [];
    const keep = new Set<string>();
    for (const page of pages) {
      const name = page.name.toLocaleLowerCase();
      if (described.has(name) && !touched.has(page.id) && changes(page.id, name)) {
        replace.push(page.id);
        continue;
      }
      for (const key of summaryKeysOf(page.id, page.name)) keep.add(key);
    }
    // A new page that the file does not describe receives the usual widgets first.
    const known = new Set(pages.map((page) => page.name.toLocaleLowerCase()));
    for (const widget of parsed.document.widgets ?? []) {
      const page = widget.page.toLocaleLowerCase();
      const { type } = widget;
      // It comes with the usual widgets, without options.
      if (!known.has(page) && !described.has(page) && isSummaryWidgetType(type))
        keep.add(summaryWidgetKey(page, { type, name: '', config: {} }));
    }
    return { described, replace, touched, keep };
  }
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
      // Layouts name widgets by their position in the exported list.
      const exported = new Map<number, number>();
      const widgets = (
        sqlite
          .prepare(
            `SELECT w.id,w.type,w.name,w.config,w.size,p.name AS page,c.name AS sourceName FROM page_widgets w JOIN pages p ON p.id=w.page_id LEFT JOIN integration_instances c ON c.id=w.connection_id WHERE w.version=1 ORDER BY p.position,w.position,w.id`,
          )
          .all() as {
          id: number;
          type: string;
          name: string;
          config: string;
          size: string;
          page: string;
          sourceName: string | null;
        }[]
      )
        .flatMap<PortableWidget & { id: number }>((row) => {
          let raw: unknown;
          try {
            raw = JSON.parse(row.config);
          } catch {
            // A widget whose saved config is not JSON cannot be exported; it is left out.
            return [];
          }
          const definition = resolveWidget(row.type);
          if (definition && isPortableWidget(definition)) {
            const parsed = definition.parseConfig(raw);
            const config = parsed === null ? null : (definition.portableConfig?.(parsed) ?? parsed);
            return config === null
              ? []
              : [
                  {
                    id: row.id,
                    page: row.page,
                    type: row.type,
                    name: row.name,
                    config,
                    ...(row.size === 'wide' ? { size: 'wide' } : {}),
                  },
                ];
          }
          if (!definition?.source || row.sourceName === null) return [];
          return [
            {
              id: row.id,
              page: row.page,
              type: row.type,
              name: row.name,
              config: {},
              ...(row.size === 'wide' ? { size: 'wide' } : {}),
              source: { type: row.type, name: row.sourceName },
            },
          ];
        })
        .map(({ id, ...widget }, index) => {
          exported.set(id, index);
          return widget;
        });
      const portable = (items: (SummaryDesktopItem | SummaryPhoneItem)[]) =>
        items.flatMap<PortableSummaryItem>(({ widgetId, ...item }) => {
          const widget = exported.get(widgetId);
          return widget === undefined ? [] : [{ ...item, widget }];
        });
      const summaryLayouts = createSummaryLayouts(sqlite)
        .list()
        .flatMap<PortableSummaryLayout>(({ pageId, desktop, phone }) => {
          const page = pageNames.get(pageId);
          if (!page || (!desktop && !phone)) return [];
          return [
            {
              page,
              ...(desktop ? { desktop: portable(desktop) } : {}),
              ...(phone ? { phone: portable(phone) } : {}),
            },
          ];
        });
      return {
        pages: [...pageNames.values()],
        widgets,
        summaryLayouts,
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
          return selectServices().map(({ checkInsecure, ...row }) => {
            void checkInsecure; // A TLS exception must be granted again after import.
            return {
              ...row,
              pinned: pins.has(row.id),
              allowPrivate: Boolean(row.allowPrivate),
              links: links.get(row.id) ?? [],
            };
          }) as Service[];
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
          summaryWidgets: summaryState(parsed).keep,
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
        // Which pages hand their Summary over to the file is decided before anything is added.
        const summary = summaryState(parsed, options.pageId);
        const plan = planImport(parsed, {
          summaryWidgets: summary.keep,
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
            const createdId = Number(created.lastInsertRowid);
            // Unless the file brings the page's widgets, it starts with the usual Summary.
            if (!summary.described.has(key)) widgetStore.seedSummary(createdId);
            pageIds.set(key, createdId);
            count += 1;
          }
        }
        const insertMonitor = sqlite.prepare(
          'INSERT INTO monitors(name,allow_private,check_type,check_interval,expected_status,check_path,check_url,check_match) VALUES(?,?,?,?,?,?,?,?)',
        );
        const insertCard = sqlite.prepare(
          'INSERT INTO services(id,url,category,description,icon,position,open_target,alias) VALUES(?,?,?,?,?,?,?,?)',
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
          const monitor = insertMonitor.run(
            valid.name,
            valid.allowPrivate ? 1 : 0,
            valid.checkType ?? 'http',
            valid.checkInterval ?? null,
            valid.expectedStatus ?? null,
            valid.checkPath ?? null,
            valid.checkUrl ?? null,
            valid.checkMatch ?? null,
          );
          insertCard.run(
            Number(monitor.lastInsertRowid),
            valid.url,
            valid.category,
            valid.description,
            valid.icon ?? '',
            nextServicePosition(valid.category),
            valid.openTarget ?? 'new-tab',
            plan.services[index].alias ?? null,
          );
          if (service.pinned)
            createServiceAttention(sqlite).setPinned(Number(monitor.lastInsertRowid), true);
          if (service.links?.length)
            writeLinks(
              Number(monitor.lastInsertRowid),
              service.links.map((link) => ({
                url: link.url,
                name: link.name,
                openTarget: link.openTarget ?? null,
                typeId: link.type ? ensureType(link.type.name, link.type.color) : null,
              })),
            );
          created += 1;
        });
        // The file replaces the untouched Summary of a page it describes.
        for (const pageId of summary.replace) widgetStore.removeSummary(pageId);
        const widgetIds = new Map<number, number>();
        let widgetsCreated = 0;
        for (const [index, widget] of (parsed.document.widgets ?? []).entries()) {
          if (plan.widgets[index]?.status !== 'new') continue;
          const pageId = options.pageId ?? pageIds.get(widget.page.toLocaleLowerCase());
          if (!pageId) continue;
          // Pages of the file that fall back to another one do not double its Summary.
          const { type } = widget;
          if (
            isSummaryWidgetType(type) &&
            !pageIds.has(widget.page.toLocaleLowerCase()) &&
            summaryKeysOf(pageId, '').includes(summaryWidgetKey('', { ...widget, type }))
          )
            continue;
          // A page holds a limited number of widgets; the rest of the file's widgets are skipped.
          if (!widgetStore.hasRoom(pageId)) continue;
          const created = widgetStore.insert({
            pageId,
            type: widget.type,
            name: widget.name,
            config: widget.config,
            connectionId: null,
            size: widget.size ?? 'normal',
          });
          const ref = parsed.document.widgetRefs?.[index];
          if (ref !== undefined) widgetIds.set(ref, created);
          widgetsCreated += 1;
        }
        let layoutsApplied = 0;
        for (const layout of parsed.document.summaryLayouts ?? []) {
          const pageId =
            options.pageId === undefined ? pageIds.get(layout.page.toLocaleLowerCase()) : undefined;
          // Importing never rearranges a Summary someone has already changed.
          if (!pageId || summary.touched.has(pageId)) continue;
          const local = <T>(items: PortableSummaryItem[] | undefined) =>
            items?.flatMap(({ widget, ...rest }) => {
              const widgetId = widgetIds.get(widget);
              // The widget must have been created on this very page.
              const here =
                widgetId !== undefined &&
                sqlite
                  .prepare('SELECT 1 FROM page_widgets WHERE id=? AND page_id=?')
                  .get(widgetId, pageId);
              return here ? [{ ...rest, widgetId } as T] : [];
            }) ?? null;
          createSummaryLayouts(sqlite).write(pageId, {
            desktop: local<SummaryDesktopItem>(layout.desktop),
            phone: local<SummaryPhoneItem>(layout.phone),
          });
          layoutsApplied += 1;
        }
        if (created || widgetsCreated || layoutsApplied) bumpVersion();
        return { status: 'applied' as const, plan, created, widgetsCreated };
      });
    },
  };
}
