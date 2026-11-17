/** Returns true when `value` contains ASCII control characters (0x00–0x1F or 0x7F). */
export function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export type TextDiff = { prefix: string; before: string; after: string; suffix: string };

/**
 * Splits two values into what they share at the start and end and what differs between, so the
 * difference can be emphasized. Returns null when little is shared and highlighting adds nothing.
 */
export function textDiff(before: string, after: string): TextDiff | null {
  if (!before || !after || before === after) return null;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  if (start + end < 3) return null;
  return {
    prefix: before.slice(0, start),
    before: before.slice(start, before.length - end),
    after: after.slice(start, after.length - end),
    suffix: before.slice(before.length - end),
  };
}
