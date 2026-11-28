import { MAX_PAGE_WIDGETS } from '@homora/shared';
import { isSummaryWidgetType } from '@homora/widgets/summary';
import { isPortableWidget } from '@homora/widgets';
import { resolveWidget } from '@homora/integrations';
import { samePageName } from '@homora/shared';
import type { ImportPlan, ParsedImport } from './types.js';

type Existing = {
  groups: string[];
  services: { category: string; url: string; alias?: string | null }[];
  pages?: string[];
  widgetCount?: number;
  /** Summary widgets an import must not add again, as `summaryWidgetKey`s. */
  summaryWidgets?: Set<string>;
};

/** Compares file with current configuration. Additive only: nothing is overwritten or deleted. */
export const summaryWidgetKey = (page: string, type: string) =>
  `${page.toLocaleLowerCase()}\n${type}`;

export function planImport(parsed: ParsedImport, existing: Existing): ImportPlan {
  const issues = [...parsed.issues];
  const knownGroups = new Set(existing.groups);
  const seenGroups = new Set<string>();
  const existingKeys = new Set(existing.services.map((s) => `${s.category}\n${s.url}`));
  const fileKeys = new Set<string>();
  const aliases = new Set(existing.services.flatMap((s) => (s.alias ? [s.alias] : [])));
  const groups: ImportPlan['groups'] = [];
  const knownPages = existing.pages ?? [];
  const pages: ImportPlan['pages'] = [];
  const wantedPages = [
    ...(parsed.document.pages ?? []),
    ...(parsed.document.widgets ?? []).map((widget) => widget.page),
    ...parsed.document.groups.flatMap((group) => (group.page ? [group.page] : [])),
  ];
  for (const name of wantedPages)
    if (!pages.some((page) => samePageName(page.name, name)))
      pages.push({
        name,
        status: knownPages.some((known) => samePageName(known, name)) ? 'existing' : 'new',
      });
  const services: ImportPlan['services'] = [];
  parsed.document.groups.forEach((group, groupIndex) => {
    if (!seenGroups.has(group.name)) {
      seenGroups.add(group.name);
      groups.push({
        name: group.name,
        status: knownGroups.has(group.name) ? 'existing' : 'new',
        ...(group.page ? { page: group.page } : {}),
      });
    }
    group.services.forEach((service, index) => {
      const key = `${group.name}\n${service.url}`;
      const repeated = fileKeys.has(key);
      if (repeated)
        issues.push({
          path: `groups[${groupIndex}].services[${index}]`,
          code: 'duplicate-in-file',
          severity: 'warning',
        });
      fileKeys.add(key);
      const isNew = !repeated && !existingKeys.has(key);
      const alias =
        isNew && service.alias && !aliases.has(service.alias) ? service.alias : undefined;
      if (isNew && service.alias && !alias)
        issues.push({
          path: `groups[${groupIndex}].services[${index}].alias`,
          code: 'alias-conflict',
          severity: 'warning',
        });
      if (alias) aliases.add(alias);
      services.push({
        ...(alias ? { alias } : {}),
        group: group.name,
        name: service.name,
        url: service.url,
        status: repeated || existingKeys.has(key) ? 'duplicate' : 'new',
      });
    });
  });
  let remainingWidgets = Math.max(0, MAX_PAGE_WIDGETS - (existing.widgetCount ?? 0));
  const widgets = (parsed.document.widgets ?? []).map((widget, index) => {
    const portable = isPortableWidget(resolveWidget(widget.type));
    // A page keeps the Summary widgets it already has instead of receiving them again.
    const repeated =
      isSummaryWidgetType(widget.type) &&
      existing.summaryWidgets?.has(summaryWidgetKey(widget.page, widget.type));
    const canCreate = portable && !repeated && remainingWidgets > 0;
    if (canCreate) remainingWidgets -= 1;
    else if (portable && !repeated)
      issues.push({ path: `widgets[${index}]`, code: 'widget-limit', severity: 'warning' });
    return {
      page: widget.page,
      name: widget.name,
      type: widget.type,
      status: canCreate ? ('new' as const) : ('skipped' as const),
    };
  });
  return {
    widgets,
    groups,
    pages,
    services,
    issues,
    summary: {
      newGroups: groups.filter((g) => g.status === 'new').length,
      newPages: pages.filter((page) => page.status === 'new').length,
      newWidgets: widgets.filter((widget) => widget.status === 'new').length,
      newServices: services.filter((s) => s.status === 'new').length,
      duplicates: services.filter((s) => s.status === 'duplicate').length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}
