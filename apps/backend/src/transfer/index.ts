/**
 * Public interface of configuration import and export.
 *
 * Everything here is pure: format contracts, parse budgets, parsers (Homora YAML/JSON, Homepage,
 * Dashy), icon mapping, the shared collector, the additive import planner and the serializer. The
 * module imports no routes, SQLite, authorization or confirmation logic; those stay in
 * `service-configuration-transfer.ts` and `routes/config-transfer.ts`. Docker discovery reuses the
 * collector exported below. Limits owned elsewhere (e.g. `MAX_GROUP_COLUMNS`) are imported from
 * their owner, never the other way around. See ADR 0015.
 */
export * from './types.js';
export { isRecord, parseService, parseTransfer, withinParseBudget } from './parser.js';
export { planImport, summaryWidgetKey } from './planner.js';
export { serializeConfiguration } from './serializer.js';
export {
  IMPORT_SOURCES,
  add,
  finish,
  groupFor,
  mapIcon,
  newCollector,
  parseBySource,
  parseDashy,
  parseHomepage,
} from './importers.js';
export type { Collector, ImportSource } from './importers.js';
