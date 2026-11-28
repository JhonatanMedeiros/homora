import {
  SUMMARY_BLOCK_SIZES,
  SUMMARY_BLOCKS,
  SUMMARY_COLUMNS,
  SUMMARY_MAX_ROWS,
  SUMMARY_WIDGET_SIZES,
  summaryKey,
  type SummaryBlock,
  type SummaryDesktopItem,
  type SummaryPhoneItem,
  type SummaryRef,
} from '@homora/shared';

/** The widgets of one page, as far as the arrangement cares. */
export type LayoutWidget = { id: number; size: 'normal' | 'wide' };

/** Stands for "every page widget here" in the default orders. */
const WIDGETS = 'widgets';
type Slot = SummaryBlock | typeof WIDGETS;

const PHONE_ORDER: readonly Slot[] = [
  'pinned',
  'attention',
  'proposals',
  'status',
  WIDGETS,
  'figures',
  'availability',
  'latency',
  'maintenance',
  'services',
  'hosts',
  'probes',
];

/**
 * Wide screens: the first widgets stand beside the latency and the maintenance, so they form a
 * column on the right; any further ones flow after them.
 */
function desktopOrder(widgets: LayoutWidget[]): SummaryRef[] {
  const waiting: SummaryRef[] = widgets.map((widget) => ({ widgetId: widget.id }));
  const after = new Set<SummaryBlock>(['latency', 'maintenance']);
  const order = SUMMARY_BLOCKS.flatMap((block): SummaryRef[] => [
    { block },
    ...(after.has(block) ? waiting.splice(0, 1) : []),
  ]);
  return [...order, ...waiting];
}

const phoneOrder = (widgets: LayoutWidget[]): SummaryRef[] =>
  PHONE_ORDER.flatMap((slot): SummaryRef[] =>
    slot === WIDGETS ? widgets.map((widget) => ({ widgetId: widget.id })) : [{ block: slot }],
  );

export function limitsOf(ref: SummaryRef, widgets: LayoutWidget[] = []) {
  if (ref.block !== undefined) return SUMMARY_BLOCK_SIZES[ref.block];
  const widget = widgets.find((item) => item.id === ref.widgetId);
  return SUMMARY_WIDGET_SIZES[widget?.size ?? 'normal'];
}

const sized = (ref: SummaryRef, widgets: LayoutWidget[]): SummaryDesktopItem => {
  const { width, height } = limitsOf(ref, widgets);
  return { ...ref, width, height, hidden: false };
};

/**
 * The saved entries that still exist, in their order, followed by everything saved nowhere yet:
 * blocks of a newer version and widgets added since.
 */
function merge<T extends SummaryPhoneItem>(
  saved: T[],
  all: SummaryRef[],
  make: (ref: SummaryRef) => T,
): T[] {
  const known = new Set(all.map(summaryKey));
  const kept = saved.filter((item) => known.has(summaryKey(item)));
  const present = new Set(kept.map(summaryKey));
  return [
    // A widget is on the Summary for as long as it exists; only blocks can be taken off.
    ...kept.map((item) =>
      item.widgetId !== undefined && item.hidden ? { ...item, hidden: false } : item,
    ),
    ...all.filter((ref) => !present.has(summaryKey(ref))).map(make),
  ];
}

export function resolveDesktop(
  saved: SummaryDesktopItem[] | null,
  widgets: LayoutWidget[],
): SummaryDesktopItem[] {
  const all = desktopOrder(widgets);
  const make = (ref: SummaryRef) => sized(ref, widgets);
  return saved ? merge(saved, all, make) : all.map(make);
}

export function resolvePhone(
  saved: SummaryPhoneItem[] | null,
  widgets: LayoutWidget[],
): SummaryPhoneItem[] {
  const all = phoneOrder(widgets);
  const make = (ref: SummaryRef): SummaryPhoneItem => ({ ...ref, hidden: false });
  return saved ? merge(saved, all, make) : all.map(make);
}

/** Moves an entry to the place another holds; unknown keys change nothing. */
export function moveTo<T extends SummaryRef>(items: T[], key: string, targetKey: string): T[] {
  const from = items.findIndex((item) => summaryKey(item) === key);
  const to = items.findIndex((item) => summaryKey(item) === targetKey);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Moves an entry one visible place earlier or later; hidden entries are stepped over. */
export function step<T extends SummaryRef & { hidden: boolean }>(
  items: T[],
  key: string,
  delta: -1 | 1,
  shown: (item: T) => boolean = (item) => !item.hidden,
): T[] {
  const visible = items.filter((item) => shown(item) || summaryKey(item) === key);
  const at = visible.findIndex((item) => summaryKey(item) === key);
  const target = visible[at + delta];
  return at >= 0 && target ? moveTo(items, key, summaryKey(target)) : items;
}

export function setHidden<T extends SummaryRef & { hidden: boolean }>(
  items: T[],
  key: string,
  hidden: boolean,
): T[] {
  const found = items.find((item) => summaryKey(item) === key);
  if (!found) return items;
  const changed = { ...found, hidden };
  // A block brought back goes to the end, where it can be seen arriving.
  return hidden
    ? items.map((item) => (item === found ? changed : item))
    : [...items.filter((item) => item !== found), changed];
}

export function resize(
  items: SummaryDesktopItem[],
  key: string,
  size: { width: number; height: number },
  widgets: LayoutWidget[],
): SummaryDesktopItem[] {
  return items.map((item) => {
    if (summaryKey(item) !== key) return item;
    const limits = limitsOf(item, widgets);
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(value)));
    const width = clamp(size.width, limits.minWidth, SUMMARY_COLUMNS);
    const height = clamp(size.height, limits.minHeight, SUMMARY_MAX_ROWS);
    return width === item.width && height === item.height ? item : { ...item, width, height };
  });
}

/** Columns on medium screens, where a third of the width is too narrow: half or all of it. */
export const mediumWidth = (width: number) =>
  width <= SUMMARY_COLUMNS / 2 ? SUMMARY_COLUMNS / 2 : SUMMARY_COLUMNS;
