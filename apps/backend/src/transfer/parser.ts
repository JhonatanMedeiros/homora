import { isPortableWidget } from '@homora/widgets';
import { resolveWidget } from '@homora/integrations';
import { parse } from 'yaml';
import { MAX_GROUP_COLUMNS } from '../group-limits.js';
import {
  OPEN_TARGETS,
  CHECK_INTERVAL_MAX,
  CHECK_INTERVAL_MIN,
  isServiceAlias,
  isCheckMatch,
  isCheckPath,
  isCheckUrl,
  isCheckType,
  type CheckType,
  isExpectedStatus,
  isLinkColor,
  normalizeLinkName,
  normalizeLinkTypeName,
  normalizeLinkUrl,
  SERVICE_LINKS_MAX,
  normalizeIcon,
  normalizePageName,
  samePageName,
} from '@homora/shared';
import {
  MAX_FLOW_OPENERS,
  MAX_GROUPS,
  MAX_SERVICES,
  MAX_TRANSFER_CHARS,
  READABLE_TRANSFER_VERSIONS,
  type ImportDocument,
  type ImportedGroup,
  type ImportedLink,
  type ImportedService,
  type ImportIssue,
  type IssueCode,
  type ParsedImport,
} from './types.js';

/** True when `content` is small enough in structure to hand to the YAML parser. */
export function withinParseBudget(content: string): boolean {
  let openers = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if ((c === 91 || c === 123) && ++openers > MAX_FLOW_OPENERS) return false;
  }
  return true;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the optional `links` of a service; invalid items are dropped with a warning. */
function parseLinks(raw: unknown, path: string, issues: ImportIssue[]): ImportedLink[] {
  if (raw === undefined) return [];
  const warn = (at: string, code: IssueCode) =>
    issues.push({ path: at, code, severity: 'warning' });
  if (!Array.isArray(raw)) return (warn(`${path}.links`, 'link-ignored'), []);
  const links: ImportedLink[] = [];
  let limited = false;
  raw.forEach((item: unknown, index) => {
    const at = `${path}.links[${index}]`;
    if (links.length >= SERVICE_LINKS_MAX) {
      if (!limited) warn(`${path}.links`, 'link-limit');
      limited = true;
      return;
    }
    if (!isRecord(item)) return warn(at, 'link-ignored');
    const url = normalizeLinkUrl(item.url);
    const name = normalizeLinkName(item.name);
    if (url === null || name === null) return warn(at, 'link-ignored');
    const link: ImportedLink = { url, name };
    if (item.openTarget !== undefined && item.openTarget !== null) {
      const target = OPEN_TARGETS.find((candidate) => candidate === item.openTarget);
      if (target) link.openTarget = target;
      else warn(`${at}.openTarget`, 'open-target-ignored');
    }
    if (item.type !== undefined && item.type !== null) {
      const typeName = isRecord(item.type) ? normalizeLinkTypeName(item.type.name) : null;
      if (typeName && isRecord(item.type))
        link.type = {
          name: typeName,
          color: isLinkColor(item.type.color) ? item.type.color : 'neutral',
        };
      else warn(`${at}.type`, 'link-ignored');
    }
    links.push(link);
  });
  return links;
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
  const openTarget = OPEN_TARGETS.find((target) => target === raw.openTarget);
  if (raw.openTarget !== undefined && !openTarget)
    issues.push({ path: `${path}.openTarget`, code: 'open-target-ignored', severity: 'warning' });
  let checkType: CheckType | undefined;
  if (isCheckType(raw.check)) checkType = raw.check;
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
  if (raw.checkUrl !== undefined && !isCheckUrl(raw.checkUrl))
    issues.push({ path: `${path}.checkUrl`, code: 'check-ignored', severity: 'warning' });
  if (raw.checkMatch !== undefined && !isCheckMatch(raw.checkMatch))
    issues.push({ path: `${path}.checkMatch`, code: 'check-ignored', severity: 'warning' });
  const links = parseLinks(raw.links, path, issues);
  if (raw.alias !== undefined && !isServiceAlias(raw.alias))
    issues.push({ path: `${path}.alias`, code: 'alias-ignored', severity: 'warning' });
  return {
    name,
    url: url.href,
    ...(isServiceAlias(raw.alias) ? { alias: raw.alias } : {}),
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 140) : '',
    icon,
    allowPrivate: raw.allowPrivate === true,
    ...(openTarget ? { openTarget } : {}),
    ...(isExpectedStatus(expectedStatus) ? { expectedStatus: String(expectedStatus) } : {}),
    ...(isCheckUrl(raw.checkUrl) ? { checkUrl: raw.checkUrl } : {}),
    ...(isCheckPath(raw.checkPath) ? { checkPath: raw.checkPath } : {}),
    ...(isCheckMatch(raw.checkMatch) ? { checkMatch: raw.checkMatch } : {}),
    ...(checkType ? { checkType } : {}),
    ...(checkInterval ? { checkInterval } : {}),
    ...(links.length > 0 ? { links } : {}),
    ...(raw.pinned === true ? { pinned: true as const } : {}),
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
  if (!READABLE_TRANSFER_VERSIONS.includes(raw.version)) return fail('unsupported-version');
  if (raw.groups.length > MAX_GROUPS) return fail('too-many-groups');
  // `appearance` and `customCss` are exported for backup and moving by hand, but import only adds
  // cards and groups and never overwrites settings, so they are left unread on purpose.
  if (raw.pages !== undefined) {
    const names = Array.isArray(raw.pages) ? raw.pages : [];
    const listed: string[] = [];
    names.forEach((value: unknown, index) => {
      const name = normalizePageName(value);
      if (!name)
        issues.push({ path: `pages[${index}]`, code: 'page-invalid', severity: 'warning' });
      else if (!listed.some((known) => samePageName(known, name))) listed.push(name);
    });
    if (!Array.isArray(raw.pages))
      issues.push({ path: 'pages', code: 'page-invalid', severity: 'warning' });
    if (listed.length > 0) document.pages = listed;
  }
  if (raw.widgets !== undefined) {
    if (!Array.isArray(raw.widgets) || raw.widgets.length > 200)
      issues.push({ path: 'widgets', code: 'widget-invalid', severity: 'warning' });
    else {
      document.widgets = [];
      raw.widgets.forEach((item: unknown, index: number) => {
        const path = `widgets[${index}]`;
        if (
          !isRecord(item) ||
          !normalizePageName(item.page) ||
          typeof item.name !== 'string' ||
          item.name.length > 80 ||
          typeof item.type !== 'string'
        ) {
          issues.push({ path, code: 'widget-invalid', severity: 'warning' });
          return;
        }
        const page = normalizePageName(item.page)!;
        const definition = resolveWidget(item.type);
        const size = item.size === undefined ? 'normal' : item.size;
        if (
          (size !== 'normal' && size !== 'wide') ||
          !(definition?.sizes ?? ['normal']).includes(size)
        ) {
          issues.push({ path, code: 'widget-invalid', severity: 'warning' });
          return;
        }
        if (definition && isPortableWidget(definition)) {
          const config = definition.parseConfig(item.config);
          if (config !== null && item.source === undefined)
            document.widgets!.push({ page, type: item.type, name: item.name, config, size });
          else issues.push({ path, code: 'widget-invalid', severity: 'warning' });
        } else if (
          definition?.source &&
          isRecord(item.source) &&
          item.source.type === item.type &&
          typeof item.source.name === 'string' &&
          item.source.name.length <= 80 &&
          isRecord(item.config) &&
          Object.keys(item.config).length === 0
        ) {
          document.widgets!.push({
            page,
            type: item.type,
            name: item.name,
            config: {},
            size,
            source: { type: item.type, name: item.source.name },
          });
          issues.push({ path, code: 'widget-source-unavailable', severity: 'warning' });
        } else issues.push({ path, code: 'widget-invalid', severity: 'warning' });
      });
    }
  }
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
    if (rawGroup.page !== undefined && rawGroup.page !== null) {
      const page = normalizePageName(rawGroup.page);
      if (page) group.page = page;
      else issues.push({ path: `${path}.page`, code: 'page-invalid', severity: 'warning' });
    }
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
