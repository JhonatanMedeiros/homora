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
