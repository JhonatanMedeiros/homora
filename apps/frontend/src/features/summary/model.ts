import { resolveWidget } from '@homora/integrations';
import {
  SUMMARY_COLUMNS,
  SUMMARY_MAX_ROWS,
  type SummaryDesktopItem,
  type SummaryPhoneItem,
} from '@homora/shared';
import { summaryPlacement } from '@homora/widgets';
import { summaryWidgetTypes, type SummaryWidgetType } from '@homora/widgets/summary';

/** The widgets of one page, as far as the arrangement cares. */
export type LayoutWidget = { id: number; type: string; size: 'normal' | 'wide' };

/** Stands for the widgets someone added, in the default orders. */
const ADDED = 'added';
type Slot = SummaryWidgetType | typeof ADDED;

const PHONE_ORDER: readonly Slot[] = [
  'summary-pinned',
  'summary-attention',
  'summary-proposals',
  'summary-status',
  ADDED,
  'summary-figures',
  'summary-availability',
  'summary-latency',
  'summary-maintenance',
  'summary-services',
  'summary-hosts',
  'summary-probes',
];

const isOwn = (widget: LayoutWidget) =>
  (summaryWidgetTypes as readonly string[]).includes(widget.type);

const ofType = (widgets: LayoutWidget[], type: string) =>
  widgets.filter((widget) => widget.type === type);

/**
 * Wide screens: the Summary's own widgets in their reading order. The first added widgets stand
 * beside the latency and the maintenance, forming a column on the right; further ones follow.
 */
function desktopOrder(widgets: LayoutWidget[]): LayoutWidget[] {
  const waiting = widgets.filter((widget) => !isOwn(widget));
  const order = summaryWidgetTypes.flatMap((type) => [
    ...ofType(widgets, type),
    ...(type === 'summary-latency' || type === 'summary-maintenance' ? waiting.splice(0, 1) : []),
  ]);
  return [...order, ...waiting];
}

const phoneOrder = (widgets: LayoutWidget[]): LayoutWidget[] =>
  PHONE_ORDER.flatMap((slot) =>
    slot === ADDED ? widgets.filter((widget) => !isOwn(widget)) : ofType(widgets, slot),
  );

export const limitsOf = (widget: LayoutWidget) =>
  summaryPlacement(resolveWidget(widget.type), widget.size);

/**
 * The saved entries of widgets that still exist, in their order, followed by every widget saved
 * nowhere yet.
 */
function merge<T extends SummaryPhoneItem>(
  saved: T[],
  ordered: LayoutWidget[],
  make: (widget: LayoutWidget) => T,
): T[] {
  const known = new Set(ordered.map((widget) => widget.id));
  const kept = saved.filter((item) => known.has(item.widgetId));
  const present = new Set(kept.map((item) => item.widgetId));
  return [...kept, ...ordered.filter((widget) => !present.has(widget.id)).map(make)];
}

export function resolveDesktop(
  saved: SummaryDesktopItem[] | null,
  widgets: LayoutWidget[],
): SummaryDesktopItem[] {
  const make = (widget: LayoutWidget): SummaryDesktopItem => {
    const { width, height } = limitsOf(widget);
    return { widgetId: widget.id, width, height };
  };
  const ordered = desktopOrder(widgets);
  return saved ? merge(saved, ordered, make) : ordered.map(make);
}

export function resolvePhone(
  saved: SummaryPhoneItem[] | null,
  widgets: LayoutWidget[],
): SummaryPhoneItem[] {
  const make = (widget: LayoutWidget): SummaryPhoneItem => ({ widgetId: widget.id });
  const ordered = phoneOrder(widgets);
  return saved ? merge(saved, ordered, make) : ordered.map(make);
}

/** Moves an entry to the place another holds; unknown widgets change nothing. */
export function moveTo<T extends SummaryPhoneItem>(items: T[], id: number, targetId: number): T[] {
  const from = items.findIndex((item) => item.widgetId === id);
  const to = items.findIndex((item) => item.widgetId === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Moves an entry one visible place earlier or later; widgets not on screen are stepped over. */
export function step<T extends SummaryPhoneItem>(
  items: T[],
  id: number,
  delta: -1 | 1,
  shown: (item: T) => boolean = () => true,
): T[] {
  const visible = items.filter((item) => shown(item) || item.widgetId === id);
  const at = visible.findIndex((item) => item.widgetId === id);
  const target = visible[at + delta];
  return at >= 0 && target ? moveTo(items, id, target.widgetId) : items;
}

export function resize(
  items: SummaryDesktopItem[],
  id: number,
  size: { width: number; height: number },
  widgets: LayoutWidget[],
): SummaryDesktopItem[] {
  const widget = widgets.find((item) => item.id === id);
  if (!widget) return items;
  const limits = limitsOf(widget);
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(value)));
  return items.map((item) => {
    if (item.widgetId !== id) return item;
    const width = clamp(size.width, limits.minWidth, SUMMARY_COLUMNS);
    const height = clamp(size.height, limits.minHeight, SUMMARY_MAX_ROWS);
    return width === item.width && height === item.height ? item : { ...item, width, height };
  });
}

/** Columns on medium screens, where a third of the width is too narrow: half or all of it. */
export const mediumWidth = (width: number) =>
  width <= SUMMARY_COLUMNS / 2 ? SUMMARY_COLUMNS / 2 : SUMMARY_COLUMNS;
