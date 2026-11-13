import { parseTransfer } from './parser.js';
import type { ParsedImport } from './types.js';
import { parseDashy } from './importer-dashy.js';
import { parseHomepage } from './importer-homepage.js';

export { add, finish, groupFor, mapIcon, newCollector } from './importer-common.js';
export type { Collector } from './importer-common.js';
export { parseDashy } from './importer-dashy.js';
export { parseHomepage } from './importer-homepage.js';

export const IMPORT_SOURCES = ['homora', 'homepage', 'dashy'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Backward-compatible parser facade for transfer routes and discovery clients. */
export function parseBySource(source: ImportSource, content: string): ParsedImport {
  if (source === 'homepage') return parseHomepage(content);
  if (source === 'dashy') return parseDashy(content);
  return parseTransfer(content);
}
