import { parse, stringify } from 'yaml';
import {
  isCheckPath,
  isExpectedStatus,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  normalizeIcon,
  type Service,
} from '@homora/shared';

/** Homora export format version. */
export const TRANSFER_VERSION = 1;
export const MAX_TRANSFER_CHARS = 1_000_000;
export const MAX_GROUPS = 200;
export const MAX_GROUP_COLUMNS = 6;
export const MAX_SERVICES = 1000;
/**
 * Flow collections (`[` and `{`) a document may open. Deeply nested garbage makes the YAML parser
 * spend hundreds of milliseconds on the only thread; real exports use a small fraction of this.
 */
export const MAX_FLOW_OPENERS = 20_000;
/** True when `content` is small enough in structure to hand to the YAML parser. */
export function withinParseBudget(content: string): boolean {
  let openers = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if ((c === 91 || c === 123) && ++openers > MAX_FLOW_OPENERS) return false;
  }
  return true;
}

export type ImportedService = {
  name: string;
  url: string;
  description: string;
  icon: string;
  allowPrivate: boolean;
  checkType?: 'http' | 'ping';
  checkInterval?: number;
  expectedStatus?: string;
  checkPath?: string;
};
export type ImportedGroup = { name: string; columns?: number; services: ImportedService[] };
export type ImportDocument = { groups: ImportedGroup[] };

/** Stable codes: the UI translates them; the server returns no language-specific text. */
export type IssueCode =
  | 'invalid-syntax'
  | 'invalid-document'
  | 'unsupported-version'
  | 'too-many-groups'
  | 'too-many-services'
  | 'invalid-group'
  | 'invalid-service'
  | 'invalid-name'
  | 'invalid-url'
  | 'icon-ignored'
  | 'duplicate-in-file'
  | 'icon-unsupported'
  | 'columns-ignored'
  | 'check-ignored'
  | 'widget-ignored'
  | 'pages-ignored'
  | 'group-renamed';
export type ImportIssue = { path: string; code: IssueCode; severity: 'error' | 'warning' };
export type ParsedImport = { document: ImportDocument; issues: ImportIssue[] };

type Existing = { groups: string[]; services: { category: string; url: string }[] };
export type ImportPlan = {
  groups: { name: string; status: 'new' | 'existing' }[];
  services: { group: string; name: string; url: string; status: 'new' | 'duplicate' }[];
  issues: ImportIssue[];
  summary: {
    newGroups: number;
    newServices: number;
    duplicates: number;
    errors: number;
    warnings: number;
  };
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Serializes groups and cards in current order. Never includes secrets, connections or IDs. */
export function serializeConfiguration(
  groups: { name: string; columns?: number | null }[],
  services: Service[],
  format: 'yaml' | 'json',
): string {
  const names = [...new Set([...groups.map((g) => g.name), ...services.map((s) => s.category)])];
  const document = {
    version: TRANSFER_VERSION,
    groups: names.map((name) => ({
      name,
      ...(groups.find((group) => group.name === name)?.columns
        ? { columns: groups.find((group) => group.name === name)?.columns }
        : {}),
      services: services
        .filter((service) => service.category === name)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
        .map((service) => ({
          name: service.name,
          url: service.url,
          ...(service.description ? { description: service.description } : {}),
          ...(service.icon ? { icon: service.icon } : {}),
          ...(service.allowPrivate ? { allowPrivate: true } : {}),
          ...(service.checkType === 'ping' ? { check: 'ping' } : {}),
          ...(service.expectedStatus ? { expectedStatus: service.expectedStatus } : {}),
          ...(service.checkPath ? { checkPath: service.checkPath } : {}),
          ...(service.checkInterval ? { interval: service.checkInterval } : {}),
        })),
    })),
  };
  return format === 'json' ? `${JSON.stringify(document, null, 2)}\n` : stringify(document);
}

export function parseService(
  raw: unknown,
  path: string,
  issues: ImportIssue[],
): ImportedService | null {
  const error = (code: IssueCode) => issues.push({ path, code, severity: 'error' });
  if (!isRecord(raw)) return (error('invalid-service'), null);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 80) return (error('invalid-name'), null);
  let url: URL;
  try {
    url = new URL(typeof raw.url === 'string' ? raw.url.trim() : '');
  } catch {
    return (error('invalid-url'), null);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    return (error('invalid-url'), null);
  const icon = normalizeIcon(raw.icon);
  if (typeof raw.icon === 'string' && raw.icon.trim() && !icon)
    issues.push({ path, code: 'icon-ignored', severity: 'warning' });
  let checkType: 'http' | 'ping' | undefined;
  if (raw.check === 'http' || raw.check === 'ping') checkType = raw.check;
  else if (raw.check !== undefined)
    issues.push({ path: `${path}.check`, code: 'check-ignored', severity: 'warning' });
  let checkInterval: number | undefined;
  if (
    typeof raw.interval === 'number' &&
    Number.isSafeInteger(raw.interval) &&
    raw.interval >= CHECK_INTERVAL_MIN &&
    raw.interval <= CHECK_INTERVAL_MAX
  )
    checkInterval = raw.interval;
  else if (raw.interval !== undefined)
    issues.push({ path: `${path}.interval`, code: 'check-ignored', severity: 'warning' });
  const expectedStatus =
    typeof raw.expectedStatus === 'number' ? String(raw.expectedStatus) : raw.expectedStatus;
  if (raw.expectedStatus !== undefined && !isExpectedStatus(expectedStatus))
    issues.push({ path: `${path}.expectedStatus`, code: 'check-ignored', severity: 'warning' });
  if (raw.checkPath !== undefined && !isCheckPath(raw.checkPath))
    issues.push({ path: `${path}.checkPath`, code: 'check-ignored', severity: 'warning' });
  return {
    name,
    url: url.href,
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 140) : '',
    icon,
    allowPrivate: raw.allowPrivate === true,
    ...(isExpectedStatus(expectedStatus) ? { expectedStatus: String(expectedStatus) } : {}),
    ...(isCheckPath(raw.checkPath) ? { checkPath: raw.checkPath } : {}),
    ...(checkType ? { checkType } : {}),
    ...(checkInterval ? { checkInterval } : {}),
  };
}

/** Reads a Homora export file (YAML or JSON) and validates item by item. */
export function parseTransfer(content: string): ParsedImport {
  const issues: ImportIssue[] = [];
  const document: ImportDocument = { groups: [] };
  const fail = (code: IssueCode): ParsedImport => ({
    document,
    issues: [...issues, { path: '', code, severity: 'error' }],
  });
  if (content.length > MAX_TRANSFER_CHARS || !withinParseBudget(content))
    return fail('invalid-document');
  let raw: unknown;
  try {
    // JSON is valid YAML. Aliases are limited to avoid excessive expansion.
    raw = parse(content, { maxAliasCount: 10, prettyErrors: false });
  } catch {
    return fail('invalid-syntax');
  }
  if (!isRecord(raw) || !Array.isArray(raw.groups)) return fail('invalid-document');
  if (raw.version !== TRANSFER_VERSION) return fail('unsupported-version');
  if (raw.groups.length > MAX_GROUPS) return fail('too-many-groups');
  let total = 0;
  raw.groups.forEach((rawGroup: unknown, gi) => {
    const path = `groups[${gi}]`;
    const name =
      isRecord(rawGroup) && typeof rawGroup.name === 'string' ? rawGroup.name.trim() : '';
    if (!isRecord(rawGroup) || !name || name.length > 40 || !Array.isArray(rawGroup.services)) {
      issues.push({ path, code: 'invalid-group', severity: 'error' });
      return;
    }
    const group: ImportedGroup = { name, services: [] };
    if (rawGroup.columns !== undefined && rawGroup.columns !== null) {
      if (
        typeof rawGroup.columns === 'number' &&
        Number.isInteger(rawGroup.columns) &&
        rawGroup.columns >= 1 &&
        rawGroup.columns <= MAX_GROUP_COLUMNS
      )
        group.columns = rawGroup.columns;
      else issues.push({ path: `${path}.columns`, code: 'columns-ignored', severity: 'warning' });
    }
    for (const [si, rawService] of rawGroup.services.entries()) {
      total += 1;
      if (total > MAX_SERVICES) return;
      const service = parseService(rawService, `${path}.services[${si}]`, issues);
      if (service) group.services.push(service);
    }
    document.groups.push(group);
  });
  if (total > MAX_SERVICES) return fail('too-many-services');
  return { document, issues };
}

/** Compares file with current configuration. Additive only: nothing is overwritten or deleted. */
export function planImport(parsed: ParsedImport, existing: Existing): ImportPlan {
  const issues = [...parsed.issues];
  const knownGroups = new Set(existing.groups);
  const seenGroups = new Set<string>();
  const existingKeys = new Set(existing.services.map((s) => `${s.category}\n${s.url}`));
  const fileKeys = new Set<string>();
  const groups: ImportPlan['groups'] = [];
  const services: ImportPlan['services'] = [];
  parsed.document.groups.forEach((group, groupIndex) => {
    if (!seenGroups.has(group.name)) {
      seenGroups.add(group.name);
      groups.push({ name: group.name, status: knownGroups.has(group.name) ? 'existing' : 'new' });
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
    services,
    issues,
    summary: {
      newGroups: groups.filter((g) => g.status === 'new').length,
      newServices: services.filter((s) => s.status === 'new').length,
      duplicates: services.filter((s) => s.status === 'duplicate').length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}
