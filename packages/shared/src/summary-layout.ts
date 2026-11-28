/** The Summary of a Home page is a grid of the page's widgets, arranged per kind of screen. */

export const SUMMARY_COLUMNS = 12;
export const SUMMARY_MAX_ROWS = 12;
/** At least every widget a page can hold. */
export const SUMMARY_MAX_ITEMS = 80;

export type SummarySize = { width: number; height: number };
export type SummaryDesktopItem = SummarySize & { widgetId: number };
export type SummaryPhoneItem = { widgetId: number };
/** `null` means the default arrangement, which also picks up widgets added later. */
export type SummaryLayout = {
  desktop: SummaryDesktopItem[] | null;
  phone: SummaryPhoneItem[] | null;
};
export type StoredSummaryLayout = SummaryLayout & { pageId: number; revision: number };

/** A widget created together with the arrangement; its negative `id` names it there. */
export type SummaryNewWidget = {
  id: number;
  type: string;
  name: string;
  config: unknown;
  connectionId: number | null;
  size: 'normal' | 'wide';
};
/** One saved edit of a Summary: the arrangement and the widgets it adds and removes. */
export type SummaryChange = SummaryLayout & {
  revision: number;
  add?: SummaryNewWidget[];
  remove?: number[];
};

const between = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function parseItems<T extends SummaryPhoneItem>(
  value: unknown,
  sized: boolean,
): T[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > SUMMARY_MAX_ITEMS) return undefined;
  const seen = new Set<number>();
  const items: T[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const entry = raw as Record<string, unknown>;
    const allowed = new Set(['widgetId', ...(sized ? ['width', 'height'] : [])]);
    if (Object.keys(entry).some((key) => !allowed.has(key))) return undefined;
    const widgetId = entry.widgetId;
    // Negative ids name widgets that the same edit creates.
    if (
      !between(widgetId, -SUMMARY_MAX_ITEMS, Number.MAX_SAFE_INTEGER) ||
      widgetId === 0 ||
      seen.has(widgetId)
    )
      return undefined;
    seen.add(widgetId);
    if (!sized) {
      items.push({ widgetId } as T);
      continue;
    }
    if (!between(entry.width, 1, SUMMARY_COLUMNS) || !between(entry.height, 1, SUMMARY_MAX_ROWS))
      return undefined;
    items.push({ widgetId, width: entry.width, height: entry.height } as unknown as T);
  }
  return items;
}

/**
 * A layout with unique entries and sizes inside the grid, or `null`. The smallest size of each
 * widget is a matter of its definition, checked where the widgets are known.
 */
export function parseSummaryLayout(value: unknown): SummaryLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const layout = value as Record<string, unknown>;
  if (Object.keys(layout).some((key) => key !== 'desktop' && key !== 'phone')) return null;
  const desktop = parseItems<SummaryDesktopItem>(layout.desktop, true);
  const phone = parseItems<SummaryPhoneItem>(layout.phone, false);
  return desktop === undefined || phone === undefined ? null : { desktop, phone };
}
