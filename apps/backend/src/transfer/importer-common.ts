import { parse } from 'yaml';
import { BRAND_ICON_NAMES, ICON_NAMES, normalizeIcon } from '@homora/shared';
import { withinParseBudget, parseService } from './parser.js';
import {
  MAX_GROUPS,
  MAX_SERVICES,
  MAX_TRANSFER_CHARS,
  type ImportDocument,
  type ImportIssue,
  type ImportedGroup,
  type IssueCode,
  type ParsedImport,
} from './types.js';

const knownIcons = new Set<string>(ICON_NAMES);
const knownBrands = new Set<string>(BRAND_ICON_NAMES);
const EMOJI = /^\p{Extended_Pictographic}/u;

/**
 * Converts an icon from another dashboard to a Homora format. Only maps what actually
 * exists: URL, emoji, and names that match a brand logo or built-in icon (`proxmox.png`,
 * `sh-plex`, `hl-jellyfin` become `brand:`; `mdi-server` becomes `lucide:`). Nothing is fetched from CDN.
 * Returns `unsupported` when an icon could not be retained.
 */
export function mapIcon(raw: unknown): { icon: string; unsupported: boolean } {
  if (typeof raw !== 'string' || !raw.trim()) return { icon: '', unsupported: false };
  const value = raw.trim();
  if (value === 'favicon') return { icon: '', unsupported: false };
  if (/^https?:\/\//i.test(value) || /^(?:lucide|brand):/.test(value)) {
    const icon = normalizeIcon(value);
    return { icon, unsupported: !icon };
  }
  if (EMOJI.test(value) && value.length <= 8) return { icon: value, unsupported: false };
  const fontAwesome = value.split(/\s+/).find((token) => /^fa-[a-z0-9-]+$/.test(token));
  const lowered = (fontAwesome ?? value).toLowerCase();
  const prefix = /^(fa|mdi|si|sh|hl)-/.exec(lowered)?.[1];
  const candidate = lowered
    .replace(/^(?:fa|mdi|si|sh|hl)-/, '')
    .replace(/\.(?:png|svg|webp|jpg|jpeg|gif)$/, '')
    .replace(/-outline$/, '');
  const brand = [candidate, candidate.replace(/-(?:light|dark)$/, '')].find((name) =>
    knownBrands.has(name),
  );
  // Generic icon prefixes (fa, mdi) are not brand logos; other prefixes may be.
  if (brand && prefix !== 'fa' && prefix !== 'mdi')
    return { icon: `brand:${brand}`, unsupported: false };
  return knownIcons.has(candidate)
    ? { icon: `lucide:${candidate}`, unsupported: false }
    : { icon: '', unsupported: true };
}

export type Collector = {
  groups: Map<string, ImportedGroup>;
  issues: ImportIssue[];
  count: number;
};
export const newCollector = (): Collector => ({ groups: new Map(), issues: [], count: 0 });
export const fatal = (code: IssueCode): ParsedImport => ({
  document: { groups: [] },
  issues: [{ path: '', code, severity: 'error' }],
});
export const finish = (collector: Collector): ParsedImport => {
  if (collector.count > MAX_SERVICES) return fatal('too-many-services');
  const document: ImportDocument = { groups: [...collector.groups.values()] };
  if (document.groups.length > MAX_GROUPS) return fatal('too-many-groups');
  return { document, issues: collector.issues };
};

export function loadYaml(content: string): unknown {
  if (content.length > MAX_TRANSFER_CHARS || !withinParseBudget(content)) return undefined;
  try {
    return parse(content, { maxAliasCount: 10, prettyErrors: false });
  } catch {
    return null;
  }
}

export function groupFor(
  collector: Collector,
  rawName: string,
  path: string,
): ImportedGroup | null {
  const name = rawName.trim();
  if (!name) {
    collector.issues.push({ path, code: 'invalid-group', severity: 'error' });
    return null;
  }
  let finalName = name;
  if (name.length > 40) {
    finalName = name.slice(0, 40).trim();
    collector.issues.push({ path, code: 'group-renamed', severity: 'warning' });
  }
  const existing = collector.groups.get(finalName);
  if (existing) return existing;
  const group: ImportedGroup = { name: finalName, services: [] };
  collector.groups.set(finalName, group);
  return group;
}

export function add(
  collector: Collector,
  group: ImportedGroup,
  fields: { name: unknown; url: unknown; description?: unknown; icon?: unknown },
  path: string,
) {
  collector.count += 1;
  if (collector.count > MAX_SERVICES) return;
  const mapped = mapIcon(fields.icon);
  const service = parseService(
    { name: fields.name, url: fields.url, description: fields.description, icon: mapped.icon },
    path,
    collector.issues,
  );
  if (!service) return;
  if (mapped.unsupported)
    collector.issues.push({ path, code: 'icon-unsupported', severity: 'warning' });
  group.services.push(service);
}
