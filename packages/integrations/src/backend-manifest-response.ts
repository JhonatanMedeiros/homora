import type { Extraction, IntegrationManifest, JsonPath, Literal } from './integration-manifest.js';

export type ManifestRow = Record<string, string | number | boolean>;
export type ManifestData = Record<string, string | number | boolean | null | ManifestRow[]>;

export class IntegrationRowsLimitError extends Error {
  constructor() {
    super('Integration row limit exceeded.');
    this.name = 'IntegrationRowsLimitError';
  }
}
export type ManifestConfig = Record<string, string>;

/** Reads only own properties and valid array indexes from an untrusted response body. */
export function walkManifestPath(value: unknown, path: JsonPath): unknown {
  let current = value;
  for (const step of path) {
    if (typeof step === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[step];
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      if (!Object.hasOwn(current, step)) return undefined;
      current = (current as Record<string, unknown>)[step];
    }
  }
  return current;
}

const maxEntries = 10_000;

function typed(
  value: unknown,
  type: 'string' | 'boolean' | 'integer' | 'number',
  bounds: { maxLength?: number; min?: number; max?: number },
): string | number | boolean | undefined {
  if (type === 'string')
    return typeof value === 'string' && value.length > 0 && value.length <= (bounds.maxLength ?? 0)
      ? value
      : undefined;
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (type === 'integer' && !Number.isSafeInteger(value)) return undefined;
  if (bounds.min !== undefined && value < bounds.min) return undefined;
  if (bounds.max !== undefined && value > bounds.max) return undefined;
  return value;
}

const sameLiteral = (a: unknown, b: Literal) => a === b;

function stateOf(
  value: unknown,
  states: Readonly<Record<string, readonly Literal[]>>,
  other: string,
) {
  for (const [name, literals] of Object.entries(states))
    if (literals.some((literal) => sameLiteral(value, literal))) return name;
  return other;
}

/** Interprets one manifest extraction rule; invalid or oversized external data fails closed. */
export function extractManifestStep(
  step: Extraction,
  body: (request?: string) => unknown,
  config: ManifestConfig,
  fail: () => never,
  out: ManifestData,
) {
  if (step.op === 'config') {
    out[step.out] = config[step.key] ?? null;
    return;
  }
  const source = walkManifestPath(body(step.request), step.path);
  switch (step.op) {
    case 'pick': {
      if ((source === undefined || source === null) && step.optional) {
        out[step.out] = null;
        return;
      }
      const value = typed(source, step.type, step);
      if (value === undefined) fail();
      out[step.out] = value as string | number | boolean;
      return;
    }
    case 'count': {
      const items = source;
      if (!Array.isArray(items) || items.length > maxEntries) return fail();
      const total = step.where
        ? items.filter((item) =>
            sameLiteral(walkManifestPath(item, step.where!.path), step.where!.equals),
          ).length
        : items.length;
      if (total > (step.max ?? 100000)) fail();
      out[step.out] = total;
      return;
    }
    case 'sum': {
      const items = source;
      if (!Array.isArray(items) || items.length > maxEntries) return fail();
      let total = 0;
      for (const item of items) {
        const value = walkManifestPath(item, step.field);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fail();
        total += value;
      }
      if (total > step.max) fail();
      out[step.out] = total;
      return;
    }
    case 'last': {
      if (!Array.isArray(source) || source.length === 0 || source.length > maxEntries)
        return fail();
      const value = typed(walkManifestPath(source.at(-1), step.field), step.type, {
        maxLength: step.maxLength,
        min: -1e15,
        max: 1e15,
      });
      if (value === undefined) fail();
      out[step.out] = value as string | number | boolean;
      return;
    }
    case 'state':
      out[step.out] = stateOf(source, step.states, step.other);
      return;
    case 'rows': {
      if (!Array.isArray(source) || source.length > maxEntries) return fail();
      const lookup = walkManifestPath(body(step.lookup.request), step.lookup.path);
      if (!lookup || typeof lookup !== 'object' || Array.isArray(lookup)) return fail();
      const rows: ManifestRow[] = [];
      const seen = new Set<string | number>();
      let examined = 0;
      for (const group of source) {
        const items = walkManifestPath(group, step.items);
        if (!Array.isArray(items) || items.length > maxEntries) return fail();
        for (const item of items) {
          if (++examined > maxEntries) return fail();
          const key = typed(walkManifestPath(item, step.key), step.keyType, {
            maxLength: step.maxKeyLength,
            min: -Number.MAX_SAFE_INTEGER,
            max: Number.MAX_SAFE_INTEGER,
          });
          if (typeof key !== 'number' && typeof key !== 'string') return fail();
          if (seen.has(key)) continue;
          seen.add(key);
          if (rows.length >= step.max) throw new IntegrationRowsLimitError();
          const history = Object.hasOwn(lookup, String(key))
            ? (lookup as Record<string, unknown>)[String(key)]
            : undefined;
          if (history !== undefined && (!Array.isArray(history) || history.length > maxEntries))
            return fail();
          const latest = Array.isArray(history) ? history.at(-1) : undefined;
          const row: ManifestRow = {};
          for (const [name, spec] of Object.entries(step.fields)) {
            const value = typed(
              walkManifestPath(spec.source === 'item' ? item : group, spec.path),
              spec.type,
              spec,
            );
            if (value === undefined) return fail();
            row[name] = value;
          }
          row[step.lookup.out] = stateOf(
            walkManifestPath(latest, step.lookup.field),
            step.lookup.states,
            step.lookup.other,
          );
          rows.push(row);
        }
      }
      out[step.out] = rows;
      return;
    }
    case 'tally': {
      const groups =
        source && typeof source === 'object' && !Array.isArray(source)
          ? Object.values(source)
          : null;
      if (!groups || groups.length > maxEntries) return fail();
      for (const name of [...Object.keys(step.states), step.other]) out[name] = 0;
      for (const group of groups) {
        if (!Array.isArray(group)) return fail();
        const latest: unknown = group.at(-1);
        const name = stateOf(
          latest === undefined ? undefined : walkManifestPath(latest, step.field),
          step.states,
          step.other,
        );
        out[name] = (out[name] as number) + 1;
      }
      return;
    }
  }
}

export function requiredValuesMatch(
  manifest: IntegrationManifest,
  body: (request?: string) => unknown,
  config: ManifestConfig,
) {
  return (
    manifest.require?.every((rule) => {
      const actual = walkManifestPath(body(rule.request), rule.path);
      const expected = rule.equalsConfig !== undefined ? config[rule.equalsConfig] : rule.equals;
      return expected !== undefined && actual === expected;
    }) ?? true
  );
}
