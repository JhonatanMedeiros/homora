import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Scaling, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { SummaryDesktopItem, SummaryPhoneItem } from '@homora/shared';
import { Button } from '@homora/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@homora/ui/dropdown-menu';
import { cn } from '@homora/ui/lib/utils';
import {
  limitsOf,
  mediumWidth,
  moveTo,
  resize,
  step,
  type LayoutWidget,
} from '@/features/summary/model';
import { t } from '@/i18n';

export type GridEntry = {
  id: number;
  type: string;
  title: string;
  node: ReactNode;
  /** The most rows the widget needs right now. */
  rows?: number;
  /** Takes the room its content needs; the saved height is then the least it takes. */
  fit?: boolean;
  /** Menu actions while arranging. */
  onEdit?: () => void;
  onRemove: () => void;
};

type WideProps = {
  entries: GridEntry[];
  items: SummaryDesktopItem[];
  widgets: LayoutWidget[];
  editing: boolean;
  onChange: (items: SummaryDesktopItem[]) => void;
};

/**
 * The Summary on larger screens: twelve columns, widgets flowing in reading order and filling the
 * holes. Arranging is a mode; a pointer can drag, and every move is also in the widget's menu.
 */
export function SummaryGrid({ entries, items, widgets, editing, onChange }: WideProps) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const stopResize = useRef<(() => void) | null>(null);
  useEffect(() => () => stopResize.current?.(), []);
  const byId = new Map(items.map((item) => [item.widgetId, item]));
  const shown = new Set(entries.map((entry) => entry.id));
  const visible = items.filter((item) => shown.has(item.widgetId));

  const announceMove = (next: SummaryDesktopItem[], id: number, title: string) => {
    const order = next.filter((item) => shown.has(item.widgetId));
    setMessage(
      t('summarygrid.moved', {
        name: title,
        position: order.findIndex((item) => item.widgetId === id) + 1,
        total: order.length,
      }),
    );
  };
  const move = (id: number, title: string, delta: -1 | 1) => {
    const next = step(items, id, delta, (item) => shown.has(item.widgetId));
    onChange(next);
    announceMove(next, id, title);
  };
  const remove = (entry: GridEntry) => {
    entry.onRemove();
    setMessage(t('summarygrid.removed', { name: entry.title }));
  };
  const size = (id: number, title: string, width: number, height: number) => {
    const next = resize(items, id, { width, height }, widgets);
    const item = next.find((entry) => entry.widgetId === id)!;
    onChange(next);
    setMessage(t('summarygrid.resized', { name: title, width: item.width, height: item.height }));
  };

  /** Dragging the corner changes the size by whole columns and rows. */
  const startResize = (event: ReactPointerEvent<HTMLElement>, item: SummaryDesktopItem) => {
    const cell = event.currentTarget.closest<HTMLElement>('[data-widget]');
    if (!cell || event.button !== 0) return;
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const column = box.width / item.width || 1;
    const row = box.height / item.height || 1;
    const id = item.widgetId;
    let last = items;
    const onMove = (move: PointerEvent) => {
      const next = resize(
        last,
        id,
        {
          width: item.width + (move.clientX - start.x) / column,
          height: item.height + (move.clientY - start.y) / row,
        },
        widgets,
      );
      if (next.some((entry, index) => entry !== last[index])) {
        last = next;
        onChange(next);
      }
    };
    const end = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stopResize.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    stopResize.current = end;
  };

  return (
    <>
      <ul
        data-homora="summary-grid"
        className="m-0 grid list-none grid-flow-row-dense auto-rows-[minmax(5rem,auto)] grid-cols-12 gap-4 p-0"
      >
        {entries.map((entry) => {
          const item = byId.get(entry.id);
          const widget = widgets.find((other) => other.id === entry.id);
          if (!item || !widget) return null;
          const height =
            !editing && entry.rows !== undefined ? Math.min(item.height, entry.rows) : item.height;
          const at = visible.indexOf(item);
          const limits = limitsOf(widget);
          return (
            <li
              key={entry.id}
              data-widget={entry.id}
              data-widget-type={entry.type}
              draggable={editing}
              onDragStart={(event) => {
                // The resize corner uses the pointer; it must not start a move.
                if (stopResize.current) return event.preventDefault();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(entry.id));
                setDragId(entry.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(event) => {
                if (dragId === null) return;
                event.preventDefault();
                setOverId(entry.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragId !== null) {
                  const next = moveTo(items, dragId, entry.id);
                  onChange(next);
                  announceMove(
                    next,
                    dragId,
                    entries.find((other) => other.id === dragId)?.title ?? '',
                  );
                }
                setDragId(null);
                setOverId(null);
              }}
              style={
                {
                  '--w': item.width,
                  '--wm': mediumWidth(item.width),
                  '--h': height,
                } as CSSProperties
              }
              className={cn(
                'relative flex min-w-0 flex-col [grid-column:span_var(--wm)] [grid-row:span_var(--h)] lg:[grid-column:span_var(--w)]',
                // An outline takes no room, so arranging shows the widgets at their real size.
                editing &&
                  'cursor-grab rounded-xl outline-1 outline-offset-2 outline-primary/70 outline-dashed',
                dragId === entry.id && 'opacity-40',
                overId === entry.id && dragId !== entry.id && 'ring-2 ring-primary',
              )}
            >
              {editing && (
                <div className="absolute top-1.5 right-1.5 z-10 flex max-w-[calc(100%-0.75rem)] items-center gap-2 rounded-lg border bg-popover py-1 pr-1 pl-2 text-popover-foreground shadow-md">
                  <GripVertical
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 truncate text-xs font-medium">{entry.title}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    <span aria-hidden="true">
                      {item.width}×{item.height}
                    </span>
                    <span className="sr-only">
                      {t('summarygrid.size', { width: item.width, height: item.height })}
                    </span>
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="pointer-coarse:size-11"
                        aria-label={t('summarygrid.menu', { name: entry.title })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        disabled={at <= 0}
                        onSelect={() => move(entry.id, entry.title, -1)}
                      >
                        {t('summarygrid.earlier')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={at >= visible.length - 1}
                        onSelect={() => move(entry.id, entry.title, 1)}
                      >
                        {t('summarygrid.later')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {/* The menu stays open so a size can be reached in one visit. */}
                      <DropdownMenuItem
                        disabled={item.width >= 12}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.id, entry.title, item.width + 1, item.height);
                        }}
                      >
                        {t('summarygrid.wider')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.width <= limits.minWidth}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.id, entry.title, item.width - 1, item.height);
                        }}
                      >
                        {t('summarygrid.narrower')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.height >= 12}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.id, entry.title, item.width, item.height + 1);
                        }}
                      >
                        {t('summarygrid.taller')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.height <= limits.minHeight}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.id, entry.title, item.width, item.height - 1);
                        }}
                      >
                        {t('summarygrid.shorter')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {entry.onEdit && (
                        <DropdownMenuItem onSelect={entry.onEdit}>
                          {t('common.edit')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(entry)}>
                        {t('common.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <CellBody editing={editing} fit={entry.fit} label={entry.title}>
                {entry.node}
              </CellBody>
              {editing && (
                <button
                  type="button"
                  // Keyboard and touch resize from the menu; this corner is for pointers.
                  tabIndex={-1}
                  aria-label={t('summarygrid.resize', { name: entry.title })}
                  onPointerDown={(event) => startResize(event, item)}
                  className="absolute right-0 bottom-0 grid size-7 cursor-nwse-resize touch-none place-items-center rounded-tl-md bg-primary text-primary-foreground"
                >
                  <Scaling aria-hidden="true" className="size-4 rotate-90" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </>
  );
}

/**
 * The content of a cell. When it does not fit it scrolls, and then can be focused so the keyboard
 * reaches the rest. While arranging it takes no input.
 */
function CellBody({
  editing,
  fit = false,
  label,
  children,
}: {
  editing: boolean;
  fit?: boolean;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  /** Something is still below the visible part, and the edge fades to say so. */
  const [more, setMore] = useState(false);
  const check = () => {
    const node = ref.current;
    if (!node) return;
    setOverflows(node.scrollHeight > node.clientHeight + 1);
    setMore(node.scrollHeight - node.scrollTop > node.clientHeight + 1);
  };
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(check);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    check();
    return () => observer.disconnect();
  });
  return (
    <div
      ref={ref}
      inert={editing}
      onScroll={check}
      {...(overflows && !editing ? { tabIndex: 0, role: 'group', 'aria-label': label } : {})}
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring [&>*]:shrink-0 [&>*:last-child]:grow',
        // Size containment: a scrolling widget does not stretch the rows it sits in.
        !fit && '[contain:size]',
        editing && 'opacity-60',
        more && '[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]',
      )}
    >
      {children}
    </div>
  );
}

type PhoneProps = {
  entries: GridEntry[];
  items: SummaryPhoneItem[];
  editing: boolean;
  onChange: (items: SummaryPhoneItem[]) => void;
};

/** The Summary on a phone: one column in its own order. Arranging reorders and removes. */
export function SummaryColumn({ entries, items, editing, onChange }: PhoneProps) {
  const [message, setMessage] = useState('');
  const shown = new Set(entries.map((entry) => entry.id));
  const move = (id: number, title: string, delta: -1 | 1) => {
    const next = step(items, id, delta, (item) => shown.has(item.widgetId));
    onChange(next);
    const order = next.filter((item) => shown.has(item.widgetId));
    setMessage(
      t('summarygrid.moved', {
        name: title,
        position: order.findIndex((item) => item.widgetId === id) + 1,
        total: order.length,
      }),
    );
  };
  const remove = (entry: GridEntry) => {
    entry.onRemove();
    setMessage(t('summarygrid.removed', { name: entry.title }));
  };
  return (
    <>
      <ul data-homora="summary-grid" className="m-0 flex list-none flex-col gap-4 p-0">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            data-widget={entry.id}
            data-widget-type={entry.type}
            className={cn(
              'flex min-w-0 flex-col gap-2',
              editing && 'rounded-xl border border-dashed border-primary/60 p-2',
            )}
          >
            {editing && (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.title}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  disabled={index === 0}
                  aria-label={t('summarygrid.up', { name: entry.title })}
                  onClick={() => move(entry.id, entry.title, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  disabled={index === entries.length - 1}
                  aria-label={t('summarygrid.down', { name: entry.title })}
                  onClick={() => move(entry.id, entry.title, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label={t('summarygrid.removeNamed', { name: entry.title })}
                  onClick={() => remove(entry)}
                >
                  <X />
                </Button>
              </div>
            )}
            {/* Arranging shows only the headings' size of each widget, so the order is easy to see. */}
            <div
              inert={editing}
              className={cn('flex min-w-0 flex-col gap-4', editing && 'max-h-28 overflow-hidden')}
            >
              {entry.node}
            </div>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </>
  );
}
