/** The Summary of a Home page is a grid of blocks: built-in ones and the page's widgets. */

/** Built-in blocks, in the default reading order of wide screens. */
export const SUMMARY_BLOCKS = [
  'pinned',
  'attention',
  'services',
  'hosts',
  'probes',
  'figures',
  'proposals',
  'status',
  'availability',
  'latency',
  'maintenance',
] as const;
export type SummaryBlock = (typeof SUMMARY_BLOCKS)[number];

export const SUMMARY_COLUMNS = 12;
export const SUMMARY_MAX_ROWS = 12;
/** More than the built-in blocks plus every widget a page can hold. */
export const SUMMARY_MAX_ITEMS = 40;

export type SummarySize = { width: number; height: number };
type Limits = SummarySize & { minWidth: number; minHeight: number };

/** Default and smallest size of each block, in columns and grid rows. */
export const SUMMARY_BLOCK_SIZES: Record<SummaryBlock, Limits> = {
  pinned: { width: 12, height: 1, minWidth: 4, minHeight: 1 },
  attention: { width: 8, height: 6, minWidth: 6, minHeight: 2 },
  services: { width: 4, height: 2, minWidth: 3, minHeight: 1 },
  hosts: { width: 4, height: 2, minWidth: 3, minHeight: 2 },
  probes: { width: 4, height: 4, minWidth: 3, minHeight: 2 },
  figures: { width: 8, height: 1, minWidth: 4, minHeight: 1 },
  proposals: { width: 4, height: 1, minWidth: 3, minHeight: 1 },
  status: { width: 8, height: 1, minWidth: 4, minHeight: 1 },
  availability: { width: 4, height: 4, minWidth: 3, minHeight: 2 },
  latency: { width: 4, height: 4, minWidth: 4, minHeight: 2 },
  maintenance: { width: 8, height: 2, minWidth: 4, minHeight: 1 },
};

/** Size limits of a page widget; a wide one starts at twice the columns. */
export const SUMMARY_WIDGET_SIZES: Record<'normal' | 'wide', Limits> = {
  normal: { width: 4, height: 2, minWidth: 3, minHeight: 1 },
  wide: { width: 8, height: 2, minWidth: 3, minHeight: 1 },
};

/** One entry names a built-in block or a page widget, never both. */
export type SummaryRef =
  | { block: SummaryBlock; widgetId?: never }
  | { widgetId: number; block?: never };
export type SummaryDesktopItem = SummaryRef & SummarySize & { hidden: boolean };
export type SummaryPhoneItem = SummaryRef & { hidden: boolean };
/** `null` means the default arrangement, which also picks up new blocks and widgets. */
export type SummaryLayout = {
  desktop: SummaryDesktopItem[] | null;
  phone: SummaryPhoneItem[] | null;
};
export type StoredSummaryLayout = SummaryLayout & { pageId: number; revision: number };

export const isSummaryBlock = (value: unknown): value is SummaryBlock =>
  typeof value === 'string' && (SUMMARY_BLOCKS as readonly string[]).includes(value);

export const summaryKey = (item: SummaryRef) =>
  item.block === undefined ? `widget:${item.widgetId}` : item.block;

const between = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function parseItems<T extends SummaryPhoneItem>(
  value: unknown,
  sized: boolean,
): T[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > SUMMARY_MAX_ITEMS) return undefined;
  const seen = new Set<string>();
  const items: T[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const entry = raw as Record<string, unknown>;
    const allowed = new Set(['block', 'widgetId', 'hidden', ...(sized ? ['width', 'height'] : [])]);
    if (Object.keys(entry).some((key) => !allowed.has(key))) return undefined;
    const block = entry.block;
    const widgetId = entry.widgetId;
    let ref: SummaryRef;
    if (isSummaryBlock(block) && widgetId === undefined) ref = { block };
    else if (block === undefined && between(widgetId, 1, Number.MAX_SAFE_INTEGER))
      ref = { widgetId };
    else return undefined;
    const key = summaryKey(ref);
    if (seen.has(key) || typeof entry.hidden !== 'boolean') return undefined;
    seen.add(key);
    if (!sized) {
      items.push({ ...ref, hidden: entry.hidden } as T);
      continue;
    }
    const limits = ref.block ? SUMMARY_BLOCK_SIZES[ref.block] : SUMMARY_WIDGET_SIZES.normal;
    if (
      !between(entry.width, limits.minWidth, SUMMARY_COLUMNS) ||
      !between(entry.height, limits.minHeight, SUMMARY_MAX_ROWS)
    )
      return undefined;
    items.push({
      ...ref,
      width: entry.width,
      height: entry.height,
      hidden: entry.hidden,
    } as unknown as T);
  }
  return items;
}

/** A layout with known blocks, unique entries and sizes inside their limits, or `null`. */
export function parseSummaryLayout(value: unknown): SummaryLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const layout = value as Record<string, unknown>;
  if (Object.keys(layout).some((key) => key !== 'desktop' && key !== 'phone')) return null;
  const desktop = parseItems<SummaryDesktopItem>(layout.desktop, true);
  const phone = parseItems<SummaryPhoneItem>(layout.phone, false);
  return desktop === undefined || phone === undefined ? null : { desktop, phone };
}
