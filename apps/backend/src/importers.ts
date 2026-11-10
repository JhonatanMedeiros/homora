import { parse } from 'yaml';
import { BRAND_ICON_NAMES, ICON_NAMES, normalizeIcon } from '@homora/shared';
import {
  MAX_GROUPS,
  MAX_SERVICES,
  MAX_TRANSFER_CHARS,
  isRecord,
  parseService,
  parseTransfer,
  type ImportDocument,
  type ImportIssue,
  type ImportedGroup,
  type IssueCode,
  type ParsedImport,
} from './config-transfer.js';

export const IMPORT_SOURCES = ['homora', 'homepage', 'dashy'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

const knownIcons = new Set<string>(ICON_NAMES);
const knownBrands = new Set<string>(BRAND_ICON_NAMES);
const EMOJI = /^\p{Extended_Pictographic}/u;

/**
 * Converte o ícone de outro painel para um formato do Homora. Só mapeia o que existe de
 * fato: URL, emoji e nomes que coincidem com um logo de marca ou ícone embutido (`proxmox.png`,
 * `sh-plex`, `hl-jellyfin` viram `brand:`; `mdi-server` vira `lucide:`). Nada é buscado em CDN.
 * Devolve `unsupported` quando havia um ícone que não pôde ser mantido.
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
  // Fontes de ícones genéricos (fa, mdi) não são logos de marca; as demais podem ser.
  if (brand && prefix !== 'fa' && prefix !== 'mdi')
    return { icon: `brand:${brand}`, unsupported: false };
  return knownIcons.has(candidate)
    ? { icon: `lucide:${candidate}`, unsupported: false }
    : { icon: '', unsupported: true };
}

type Collector = {
  groups: Map<string, ImportedGroup>;
  issues: ImportIssue[];
  count: number;
};
const newCollector = (): Collector => ({ groups: new Map(), issues: [], count: 0 });
const fatal = (code: IssueCode): ParsedImport => ({
  document: { groups: [] },
  issues: [{ path: '', code, severity: 'error' }],
});
const finish = (collector: Collector): ParsedImport => {
  if (collector.count > MAX_SERVICES) return fatal('too-many-services');
  const document: ImportDocument = { groups: [...collector.groups.values()] };
  if (document.groups.length > MAX_GROUPS) return fatal('too-many-groups');
  return { document, issues: collector.issues };
};

function load(content: string): unknown {
  if (content.length > MAX_TRANSFER_CHARS) return undefined;
  try {
    return parse(content, { maxAliasCount: 10, prettyErrors: false });
  } catch {
    return null;
  }
}

function groupFor(collector: Collector, rawName: string, path: string): ImportedGroup | null {
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

function add(
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

/** Entrada `- Nome: valor` de uma lista do Homepage; devolve o par ou null. */
function entryOf(item: unknown): [string, unknown] | null {
  if (!isRecord(item)) return null;
  const keys = Object.keys(item);
  return keys.length === 1 ? [keys[0], item[keys[0]]] : null;
}

const BOOKMARK_KEYS = ['href', 'abbr', 'icon', 'description'];
const isBookmarkList = (value: unknown[]) =>
  value.length > 0 &&
  value.every((item) => isRecord(item) && Object.keys(item).some((k) => BOOKMARK_KEYS.includes(k)));

function walkHomepage(
  collector: Collector,
  list: unknown[],
  parents: string[],
  pathPrefix: string,
) {
  list.forEach((item, index) => {
    const path = `${pathPrefix}[${index}]`;
    const entry = entryOf(item);
    if (!entry) {
      collector.issues.push({ path, code: 'invalid-group', severity: 'error' });
      return;
    }
    const [name, value] = entry;
    const groupName = parents.join(' / ');
    if (Array.isArray(value) && !isBookmarkList(value)) {
      walkHomepage(collector, value, [...parents, name], `${path}.${name}`);
      return;
    }
    if (parents.length === 0) {
      collector.issues.push({ path, code: 'invalid-group', severity: 'error' });
      return;
    }
    const group = groupFor(collector, groupName, path);
    if (!group) return;
    const fields = Array.isArray(value)
      ? Object.assign({}, ...(value as Record<string, unknown>[]))
      : isRecord(value)
        ? value
        : {};
    if (fields.widget || fields.widgets)
      collector.issues.push({ path, code: 'widget-ignored', severity: 'warning' });
    add(
      collector,
      group,
      { name, url: fields.href, description: fields.description, icon: fields.icon },
      path,
    );
  });
}

/**
 * `services.yaml` e `bookmarks.yaml` do Homepage (mesmo esqueleto de grupos). Grupos
 * aninhados viram "Pai / Filho". Monitoramento, widgets e Docker não são importados.
 */
export function parseHomepage(content: string): ParsedImport {
  const raw = load(content);
  if (raw === undefined) return fatal('invalid-document');
  if (raw === null && content.trim()) return fatal('invalid-syntax');
  if (!Array.isArray(raw)) return fatal('invalid-document');
  const collector = newCollector();
  walkHomepage(collector, raw, [], 'root');
  return finish(collector);
}

/**
 * `conf.yml` do Dashy: seções viram grupos e itens viram cards; `subItems` viram cards
 * "Item / Sub". Outras páginas listadas em `pages` não são lidas.
 */
export function parseDashy(content: string): ParsedImport {
  const raw = load(content);
  if (raw === undefined) return fatal('invalid-document');
  if (raw === null && content.trim()) return fatal('invalid-syntax');
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return fatal('invalid-document');
  const collector = newCollector();
  if (Array.isArray(raw.pages) && raw.pages.length > 0)
    collector.issues.push({ path: 'pages', code: 'pages-ignored', severity: 'warning' });
  raw.sections.forEach((section: unknown, si) => {
    const path = `sections[${si}]`;
    if (!isRecord(section) || typeof section.name !== 'string') {
      collector.issues.push({ path, code: 'invalid-group', severity: 'error' });
      return;
    }
    const group = groupFor(collector, section.name, path);
    if (!group) return;
    if (Array.isArray(section.widgets) && section.widgets.length > 0)
      collector.issues.push({ path, code: 'widget-ignored', severity: 'warning' });
    const items = Array.isArray(section.items) ? section.items : [];
    items.forEach((item: unknown, ii) => {
      const itemPath = `${path}.items[${ii}]`;
      if (!isRecord(item)) {
        collector.issues.push({ path: itemPath, code: 'invalid-service', severity: 'error' });
        return;
      }
      add(
        collector,
        group,
        { name: item.title, url: item.url, description: item.description, icon: item.icon },
        itemPath,
      );
      if (!Array.isArray(item.subItems)) return;
      item.subItems.forEach((sub: unknown, k) => {
        const subPath = `${itemPath}.subItems[${k}]`;
        if (!isRecord(sub)) {
          collector.issues.push({ path: subPath, code: 'invalid-service', severity: 'error' });
          return;
        }
        const title = typeof sub.title === 'string' ? sub.title.trim() : '';
        const parent = typeof item.title === 'string' ? item.title.trim() : '';
        add(
          collector,
          group,
          { name: `${parent} / ${title}`.slice(0, 80), url: sub.url, icon: sub.icon },
          subPath,
        );
      });
    });
  });
  return finish(collector);
}

export function parseBySource(source: ImportSource, content: string): ParsedImport {
  if (source === 'homepage') return parseHomepage(content);
  if (source === 'dashy') return parseDashy(content);
  return parseTransfer(content);
}
