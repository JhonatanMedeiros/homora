import { isRecord } from './parser.js';
import type { ParsedImport } from './types.js';
import {
  add,
  fatal,
  finish,
  groupFor,
  loadYaml,
  newCollector,
  type Collector,
} from './importer-common.js';

/** `- Name: value` entry from a Homepage list; returns the pair or null. */
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
 * Homepage `services.yaml` and `bookmarks.yaml` (same group structure). Nested
 * groups become "Parent / Child". Monitoring, widgets, and Docker are not imported.
 */
export function parseHomepage(content: string): ParsedImport {
  const raw = loadYaml(content);
  if (raw === undefined) return fatal('invalid-document');
  if (raw === null && content.trim()) return fatal('invalid-syntax');
  if (!Array.isArray(raw)) return fatal('invalid-document');
  const collector = newCollector();
  walkHomepage(collector, raw, [], 'root');
  return finish(collector);
}
