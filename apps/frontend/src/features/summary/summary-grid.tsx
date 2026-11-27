import { ArrowDown, ArrowUp, EyeOff, GripVertical, MoreHorizontal, Scaling } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { summaryKey, type SummaryDesktopItem, type SummaryPhoneItem } from '@homora/shared';
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
  setHidden,
  step,
  type LayoutWidget,
} from '@/features/summary/model';
import { t } from '@/i18n';

export type GridEntry = {
  key: string;
  title: string;
  node: ReactNode;
  /** The most rows the block needs right now. */
  rows?: number;
  /** Takes the room its content needs; the saved height is then the least it takes. */
  fit?: boolean;
  /** Extra menu items of a page widget, while arranging. */
  widget?: { onEdit?: () => void; onDelete: () => void };
};

type WideProps = {
  entries: GridEntry[];
  items: SummaryDesktopItem[];
  widgets: LayoutWidget[];
  editing: boolean;
  onChange: (items: SummaryDesktopItem[]) => void;
};

/**
 * The Summary on larger screens: twelve columns, blocks flowing in reading order and filling the
 * holes. Arranging is a mode; a pointer can drag, and every move is also in the block's menu.
 */
export function SummaryGrid({ entries, items, widgets, editing, onChange }: WideProps) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const stopResize = useRef<(() => void) | null>(null);
  useEffect(() => () => stopResize.current?.(), []);
  const byKey = new Map(items.map((item) => [summaryKey(item), item]));
  const shown = new Set(entries.map((entry) => entry.key));
  const visible = items.filter((item) => shown.has(summaryKey(item)));

  const announceMove = (next: SummaryDesktopItem[], key: string, title: string) => {
    const order = next.filter((item) => shown.has(summaryKey(item)));
    setMessage(
      t('summarygrid.moved', {
        name: title,
        position: order.findIndex((item) => summaryKey(item) === key) + 1,
        total: order.length,
      }),
    );
  };
  const move = (key: string, title: string, delta: -1 | 1) => {
    const next = step(items, key, delta, (item) => shown.has(summaryKey(item)));
    onChange(next);
    announceMove(next, key, title);
  };
  const size = (key: string, title: string, width: number, height: number) => {
    const next = resize(items, key, { width, height }, widgets);
    const item = next.find((entry) => summaryKey(entry) === key)!;
    onChange(next);
    setMessage(t('summarygrid.resized', { name: title, width: item.width, height: item.height }));
  };

  /** Dragging the corner changes the size by whole columns and rows. */
  const startResize = (event: ReactPointerEvent<HTMLElement>, item: SummaryDesktopItem) => {
    const cell = event.currentTarget.closest<HTMLElement>('[data-block]');
    if (!cell || event.button !== 0) return;
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const column = box.width / item.width || 1;
    const row = box.height / item.height || 1;
    const key = summaryKey(item);
    let last = items;
    const onMove = (move: PointerEvent) => {
      const next = resize(
        last,
        key,
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
          const item = byKey.get(entry.key);
          if (!item) return null;
          const height =
            !editing && entry.rows !== undefined ? Math.min(item.height, entry.rows) : item.height;
          const at = visible.indexOf(item);
          const limits = limitsOf(item, widgets);
          return (
            <li
              key={entry.key}
              data-block={entry.key}
              draggable={editing}
              onDragStart={(event) => {
                // The resize corner uses the pointer; it must not start a move.
                if (stopResize.current) return event.preventDefault();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', entry.key);
                setDragKey(entry.key);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setOverKey(null);
              }}
              onDragOver={(event) => {
                if (dragKey === null) return;
                event.preventDefault();
                setOverKey(entry.key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragKey !== null) {
                  const next = moveTo(items, dragKey, entry.key);
                  onChange(next);
                  announceMove(
                    next,
                    dragKey,
                    entries.find((other) => other.key === dragKey)?.title ?? '',
                  );
                }
                setDragKey(null);
                setOverKey(null);
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
                // An outline takes no room, so arranging shows the blocks at their real size.
                editing &&
                  'cursor-grab rounded-xl outline-1 outline-offset-2 outline-primary/70 outline-dashed',
                dragKey === entry.key && 'opacity-40',
                overKey === entry.key && dragKey !== entry.key && 'ring-2 ring-primary',
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
                        onSelect={() => move(entry.key, entry.title, -1)}
                      >
                        {t('summarygrid.earlier')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={at >= visible.length - 1}
                        onSelect={() => move(entry.key, entry.title, 1)}
                      >
                        {t('summarygrid.later')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {/* The menu stays open so a size can be reached in one visit. */}
                      <DropdownMenuItem
                        disabled={item.width >= 12}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.key, entry.title, item.width + 1, item.height);
                        }}
                      >
                        {t('summarygrid.wider')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.width <= limits.minWidth}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.key, entry.title, item.width - 1, item.height);
                        }}
                      >
                        {t('summarygrid.narrower')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.height >= 12}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.key, entry.title, item.width, item.height + 1);
                        }}
                      >
                        {t('summarygrid.taller')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={item.height <= limits.minHeight}
                        onSelect={(event) => {
                          event.preventDefault();
                          size(entry.key, entry.title, item.width, item.height - 1);
                        }}
                      >
                        {t('summarygrid.shorter')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {entry.widget?.onEdit && (
                        <DropdownMenuItem onSelect={entry.widget.onEdit}>
                          {t('common.edit')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => onChange(setHidden(items, entry.key, true))}
                      >
                        {t('summarygrid.hide')}
                      </DropdownMenuItem>
                      {entry.widget && (
                        <DropdownMenuItem variant="destructive" onSelect={entry.widget.onDelete}>
                          {t('summarygrid.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <BlockBody editing={editing} fit={entry.fit} label={entry.title}>
                {entry.node}
              </BlockBody>
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
function BlockBody({
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
        // Size containment: a scrolling block does not stretch the rows it sits in.
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

/** The Summary on a phone: one column in its own order. Arranging reorders and hides. */
export function SummaryColumn({ entries, items, editing, onChange }: PhoneProps) {
  const [message, setMessage] = useState('');
  const shown = new Set(entries.map((entry) => entry.key));
  const move = (key: string, title: string, delta: -1 | 1) => {
    const next = step(items, key, delta, (item) => shown.has(summaryKey(item)));
    onChange(next);
    const order = next.filter((item) => shown.has(summaryKey(item)));
    setMessage(
      t('summarygrid.moved', {
        name: title,
        position: order.findIndex((item) => summaryKey(item) === key) + 1,
        total: order.length,
      }),
    );
  };
  return (
    <>
      <ul data-homora="summary-grid" className="m-0 flex list-none flex-col gap-4 p-0">
        {entries.map((entry, index) => (
          <li
            key={entry.key}
            data-block={entry.key}
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
                  onClick={() => move(entry.key, entry.title, -1)}
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
                  onClick={() => move(entry.key, entry.title, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label={t('summarygrid.hideNamed', { name: entry.title })}
                  onClick={() => onChange(setHidden(items, entry.key, true))}
                >
                  <EyeOff />
                </Button>
              </div>
            )}
            {/* Arranging shows only the headings' size of each block, so the order is easy to see. */}
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
