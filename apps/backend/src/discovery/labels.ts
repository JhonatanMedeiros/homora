import type { ImportedService, ParsedImport } from '../transfer/index.js';
import { add, finish, groupFor, newCollector } from '../transfer/index.js';
import type { DockerContainer } from './local.js';

const label = (labels: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = labels[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

export type DiscoveryEntry = { id: string; container: string; group: string; url: string };

/**
 * Converts container labels into an import document. Recognizes `homora.url`, `homora.name`,
 * `homora.group`, `homora.description`, and `homora.icon`, as well as equivalent `homepage.*`
 * labels (`href` instead of `url`) for users migrating from Homepage. `homora.*` takes precedence.
 * Containers without URL are ignored. `only` limits to IDs selected during review.
 * `entries` accompanies cards in the document in matching order.
 */
export function parseDocker(
  containers: DockerContainer[],
  only?: ReadonlySet<string>,
): { parsed: ParsedImport; entries: DiscoveryEntry[]; scanned: number } {
  const collector = newCollector();
  const owner = new Map<ImportedService, { id: string; container: string }>();
  containers.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const id = typeof item.Id === 'string' ? item.Id.slice(0, 12) : '';
    if (!/^[0-9a-f]{12}$/.test(id)) return;
    if (only && !only.has(id)) return;
    const labels =
      item.Labels && typeof item.Labels === 'object' && !Array.isArray(item.Labels)
        ? (item.Labels as Record<string, unknown>)
        : {};
    const url = label(labels, 'homora.url', 'homepage.href');
    if (!url) return;
    const names = Array.isArray(item.Names) ? item.Names : [];
    const container =
      (typeof names[0] === 'string' ? names[0].replace(/^\//, '') : '').slice(0, 80) || id;
    const path = `containers[${index}]`;
    const group = groupFor(
      collector,
      label(labels, 'homora.group', 'homepage.group') ?? 'Docker',
      path,
    );
    if (!group) return;
    const before = group.services.length;
    add(
      collector,
      group,
      {
        name: label(labels, 'homora.name', 'homepage.name') ?? container,
        url,
        description: label(labels, 'homora.description', 'homepage.description'),
        icon: label(labels, 'homora.icon', 'homepage.icon'),
      },
      path,
    );
    if (group.services.length > before)
      owner.set(group.services[group.services.length - 1], { id, container });
  });
  const parsed = finish(collector);
  const entries = parsed.document.groups.flatMap((group) =>
    group.services.map((service) => ({
      id: owner.get(service)?.id ?? '',
      container: owner.get(service)?.container ?? '',
      group: group.name,
      url: service.url,
    })),
  );
  return { parsed, entries, scanned: containers.length };
}
