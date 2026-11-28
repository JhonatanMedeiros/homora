import { resolveWidget } from '@homora/integrations';
import type {
  StoredSummaryLayout,
  SummaryChange,
  SummaryDesktopItem,
  SummaryPhoneItem,
} from '@homora/shared';
import { summaryWidgetTypes } from '@homora/widgets/summary';
import type { PageWidget } from '@/components/use-page-widget-data';

export type Items = SummaryDesktopItem[] | SummaryPhoneItem[] | null;
export type NewWidget = Omit<PageWidget, 'id' | 'position' | 'version'>;

/** An edit of one page's Summary that has not been saved. */
export type Draft = {
  pageId: number;
  phone: boolean;
  revision: number;
  /** Null stands for the default arrangement. */
  items: Items;
  /** Widgets to create, under negative ids, and to delete when the edit is saved. */
  add: PageWidget[];
  remove: number[];
};

/** The saved arrangement for one kind of screen. */
export const savedItems = (stored: StoredSummaryLayout | null, phone: boolean): Items =>
  phone ? (stored?.phone ?? null) : (stored?.desktop ?? null);

export const startDraft = (
  pageId: number,
  phone: boolean,
  stored: StoredSummaryLayout | null,
): Draft => ({
  pageId,
  phone,
  revision: stored?.revision ?? 0,
  items: savedItems(stored, phone),
  add: [],
  remove: [],
});

/** Gives a widget that does not exist yet an id no stored widget can have. */
export function newWidget(draft: Draft, widget: NewWidget): PageWidget {
  const id = Math.min(0, ...draft.add.map((item) => item.id)) - 1;
  return { ...widget, id, position: Number.MAX_SAFE_INTEGER + id, version: 1 };
}

export const addWidget = (draft: Draft, widget: PageWidget): Draft => ({
  ...draft,
  add: [...draft.add, widget],
});

export const updateWidget = (draft: Draft, widget: PageWidget): Draft => ({
  ...draft,
  add: draft.add.map((item) => (item.id === widget.id ? widget : item)),
});

/** A widget not yet created is forgotten; a stored one is deleted when the edit is saved. */
export const removeWidget = (draft: Draft, id: number): Draft =>
  id < 0
    ? { ...draft, add: draft.add.filter((item) => item.id !== id) }
    : { ...draft, remove: [...draft.remove, id] };

const isOwn = (widget: PageWidget) => resolveWidget(widget.type)?.summaryOnly === true;

/**
 * The default arrangement, with every widget the Summary starts with back in it. `stored` are the
 * widgets of the page as the server has them.
 */
export function restoreDefault(draft: Draft, stored: PageWidget[]): Draft {
  const own = new Set(stored.filter(isOwn).map((widget) => widget.id));
  let next: Draft = { ...draft, items: null, remove: draft.remove.filter((id) => !own.has(id)) };
  const present = new Set(
    [...stored.filter((widget) => !next.remove.includes(widget.id)), ...next.add].map(
      (widget) => widget.type,
    ),
  );
  for (const type of summaryWidgetTypes)
    if (!present.has(type))
      next = addWidget(
        next,
        newWidget(next, {
          pageId: draft.pageId,
          type,
          name: '',
          config: {},
          connectionId: null,
          size: 'normal',
        }),
      );
  return next;
}

export const isUnchanged = (draft: Draft, stored: StoredSummaryLayout | null) =>
  draft.items === savedItems(stored, draft.phone) &&
  draft.add.length === 0 &&
  draft.remove.length === 0;

/** Whether adding the widget again from the gallery would not bring it back as it was. */
const hasSettings = (widget: PageWidget) =>
  !isOwn(widget) || widget.name !== '' || Object.keys(widget.config ?? {}).length > 0;

/** The widgets whose settings saving the edit would delete. */
export const lostSettings = (draft: Draft, stored: PageWidget[]) =>
  stored.filter((widget) => draft.remove.includes(widget.id) && hasSettings(widget));

/**
 * What to send. `present` are the widgets the page will have: places of widgets removed here or
 * gone elsewhere are dropped from both arrangements.
 */
export function toChange(
  draft: Draft,
  stored: StoredSummaryLayout | null,
  present: Set<number>,
): SummaryChange {
  const kept = <T extends SummaryPhoneItem>(entries: T[] | null) =>
    entries?.filter((item) => present.has(item.widgetId)) ?? null;
  const items = <T extends SummaryPhoneItem>(phone: boolean) =>
    (draft.phone === phone ? draft.items : savedItems(stored, phone)) as T[] | null;
  return {
    revision: draft.revision,
    desktop: kept(items<SummaryDesktopItem>(false)),
    phone: kept(items<SummaryPhoneItem>(true)),
    add: draft.add.map(({ id, type, name, config, connectionId, size }) => ({
      id,
      type,
      name,
      config,
      connectionId,
      size,
    })),
    remove: draft.remove,
  };
}
