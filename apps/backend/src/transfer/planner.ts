import { samePageName } from '@homora/shared';
import type { ImportPlan, ParsedImport } from './types.js';

type Existing = {
  groups: string[];
  services: { category: string; url: string }[];
  pages?: string[];
};

/** Compares file with current configuration. Additive only: nothing is overwritten or deleted. */
export function planImport(parsed: ParsedImport, existing: Existing): ImportPlan {
  const issues = [...parsed.issues];
  const knownGroups = new Set(existing.groups);
  const seenGroups = new Set<string>();
  const existingKeys = new Set(existing.services.map((s) => `${s.category}\n${s.url}`));
  const fileKeys = new Set<string>();
  const groups: ImportPlan['groups'] = [];
  const knownPages = existing.pages ?? [];
  const pages: ImportPlan['pages'] = [];
  const wantedPages = [
    ...(parsed.document.pages ?? []),
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
      services.push({
        group: group.name,
        name: service.name,
        url: service.url,
        status: repeated || existingKeys.has(key) ? 'duplicate' : 'new',
      });
    });
  });
  return {
    groups,
    pages,
    services,
    issues,
    summary: {
      newGroups: groups.filter((g) => g.status === 'new').length,
      newPages: pages.filter((page) => page.status === 'new').length,
      newServices: services.filter((s) => s.status === 'new').length,
      duplicates: services.filter((s) => s.status === 'duplicate').length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}
