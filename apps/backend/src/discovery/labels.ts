import type { ImportedService, IssueCode, ParsedImport } from '../transfer/index.js';
import { add, finish, groupFor, newCollector } from '../transfer/index.js';
import type { DockerContainer } from './local.js';

const label = (labels: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = labels[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

/** `note` explains that the address came from a label and may not open in the browser. */
export type DiscoveryEntry = {
  id: string;
  container: string;
  group: string;
  url: string;
  note?: 'loopback' | 'internal-name';
};
/** A container that was read but cannot be offered, with a stable reason for the UI. */
export type DiscoverySkipped = { id: string; container: string };
export type DiscoveryRejected = { id: string; container: string; code: IssueCode };
export type DiscoveryOverride = { name?: string; group?: string; url?: string };

const MAX_SKIPPED = 100;

/**
 * An address taken from a label is only a suggestion: it is not proof that the browser can open
 * it. Flags the cases that are evidently wrong from the browser's side without resolving DNS.
 */
export function addressNote(url: string): DiscoveryEntry['note'] {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return undefined;
  }
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host))
    return 'loopback';
  if (!host.includes('.') && !host.includes(':')) return 'internal-name';
  return undefined;
}

/**
 * Converts container labels into an import document. Recognizes `homora.url`, `homora.name`,
 * `homora.group`, `homora.description`, and `homora.icon`, as well as equivalent `homepage.*`
 * labels (`href` instead of `url`) for users migrating from Homepage. `homora.*` takes precedence.
 * Containers without URL are ignored. `only` limits to IDs selected during review.
 * `entries` accompanies cards in the document in matching order. `overrides` replace the name,
 * group or address of selected containers during review; they pass through the same validation
 * as labels. Without `only`, containers with no URL label are listed in `skipped` (informational
 * only, never selectable) and containers whose data failed validation in `rejected`.
 */
export function parseDocker(
  containers: DockerContainer[],
  only?: ReadonlySet<string>,
  overrides?: ReadonlyMap<string, DiscoveryOverride>,
): {
  parsed: ParsedImport;
  entries: DiscoveryEntry[];
  scanned: number;
  skipped: DiscoverySkipped[];
  skippedTotal: number;
  rejected: DiscoveryRejected[];
} {
  const collector = newCollector();
  const skipped: DiscoverySkipped[] = [];
  let skippedTotal = 0;
  const seen = new Map<number, { id: string; container: string }>();
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
    const names = Array.isArray(item.Names) ? item.Names : [];
    const container =
      (typeof names[0] === 'string' ? names[0].replace(/^\//, '') : '').slice(0, 80) || id;
    const override = overrides?.get(id);
    const url = override?.url?.trim() || label(labels, 'homora.url', 'homepage.href');
    if (!url) {
      if (!only) {
        skippedTotal += 1;
        if (skipped.length < MAX_SKIPPED) skipped.push({ id, container });
      }
      return;
    }
    const path = `containers[${index}]`;
    seen.set(index, { id, container });
    const group = groupFor(
      collector,
      override?.group?.trim() || (label(labels, 'homora.group', 'homepage.group') ?? 'Docker'),
      path,
    );
    if (!group) return;
    const before = group.services.length;
    add(
      collector,
      group,
      {
        name:
          override?.name?.trim() || (label(labels, 'homora.name', 'homepage.name') ?? container),
        url,
        description: label(labels, 'homora.description', 'homepage.description'),
        icon: label(labels, 'homora.icon', 'homepage.icon'),
      },
      path,
    );
    if (group.services.length > before)
      owner.set(group.services[group.services.length - 1], { id, container });
    // A rejected container must not leave an empty group behind to be created on import.
    else if (group.services.length === 0) collector.groups.delete(group.name);
  });
  const parsed = finish(collector);
  const entries = parsed.document.groups.flatMap((group) =>
    group.services.map((service) => ({
      id: owner.get(service)?.id ?? '',
      container: owner.get(service)?.container ?? '',
      group: group.name,
      url: service.url,
      ...(addressNote(service.url) ? { note: addressNote(service.url) } : {}),
    })),
  );
  const rejected: DiscoveryRejected[] = [];
  const reported = new Set<string>();
  for (const issue of parsed.issues) {
    const index = /^containers\[(\d+)\]/.exec(issue.path)?.[1];
    const owner = index === undefined ? undefined : seen.get(Number(index));
    if (issue.severity !== 'error' || !owner || reported.has(owner.id)) continue;
    reported.add(owner.id);
    rejected.push({ ...owner, code: issue.code });
  }
  return { parsed, entries, scanned: containers.length, skipped, skippedTotal, rejected };
}
