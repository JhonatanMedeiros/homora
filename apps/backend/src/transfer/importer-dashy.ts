import { isRecord } from './parser.js';
import type { ParsedImport } from './types.js';
import { add, fatal, finish, groupFor, loadYaml, newCollector } from './importer-common.js';

/**
 * Dashy `conf.yml`: sections become groups and items become cards; `subItems` become
 * "Item / Sub" cards. Other pages listed in `pages` are not read.
 */
export function parseDashy(content: string): ParsedImport {
  const raw = loadYaml(content);
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
