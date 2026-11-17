/** True when `value` is a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads only own properties and valid array indexes along `path`, returning `undefined` when any
 * segment is missing or traverses a prototype property.
 */
export function getOwnPath(
  value: unknown,
  path: readonly (string | number)[],
  options: { allowNumericArrayKeys?: boolean } = {},
): unknown {
  let current = value;
  for (const step of path) {
    if (typeof step === 'number') {
      if (!Array.isArray(current)) return undefined;
    } else if (Array.isArray(current)) {
      if (!options.allowNumericArrayKeys || !/^\d+$/.test(step) || !Object.hasOwn(current, step))
        return undefined;
    } else if (!isRecord(current) || !Object.hasOwn(current, step)) {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[step];
  }
  return current;
}
