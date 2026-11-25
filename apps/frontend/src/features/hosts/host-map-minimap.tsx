import { useRef } from 'react';
import type { MapLayout } from '@/features/hosts/map-layout';
import type { VisibleRect } from '@/features/hosts/use-host-map-viewport';
import { cn } from '@homora/ui/lib/utils';

const WIDTH = 176;
const HEIGHT = 108;
const PAD = 6;

type Props = {
  layout: MapLayout;
  visible: VisibleRect | null;
  /** Containers that hold a problem are tinted, so trouble can be found from here. */
  problemIds: ReadonlySet<string>;
  onPan: (x: number, y: number) => void;
  className?: string;
};

/**
 * Small overview of the whole map with the part on screen outlined. Pressing or dragging on it
 * moves the view. It is a pointer shortcut only: the canvas itself stays reachable by keyboard
 * and scrolling, so the minimap is hidden from assistive technology.
 */
export function HostMapMinimap({ layout, visible, problemIds, onPan, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  if (layout.width === 0 || layout.height === 0) return null;
  const scale = Math.min((WIDTH - PAD * 2) / layout.width, (HEIGHT - PAD * 2) / layout.height);
  const offsetX = (WIDTH - layout.width * scale) / 2;
  const offsetY = (HEIGHT - layout.height * scale) / 2;
  const at = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    onPan((clientX - rect.left - offsetX) / scale, (clientY - rect.top - offsetY) / scale);
  };
  return (
    <div
      ref={box}
      aria-hidden="true"
      data-homora="host-map-minimap"
      style={{ width: WIDTH, height: HEIGHT }}
      className={cn(
        'relative cursor-pointer touch-none overflow-hidden rounded-lg border bg-card',
        className,
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        at(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) at(event.clientX, event.clientY);
      }}
    >
      {layout.containers.map((container) => (
        <span
          key={container.id}
          style={{
            left: offsetX + container.x * scale,
            top: offsetY + container.y * scale,
            width: Math.max(2, container.w * scale),
            height: Math.max(2, container.h * scale),
          }}
          className={cn(
            'absolute rounded-[2px]',
            problemIds.has(container.id) ? 'bg-destructive/70' : 'bg-muted-foreground/30',
            container.kind !== 'node' && 'border border-dashed border-muted-foreground/60',
          )}
        />
      ))}
      {visible && (
        <span
          style={{
            left: offsetX + visible.x * scale,
            top: offsetY + visible.y * scale,
            width: Math.max(4, visible.w * scale),
            height: Math.max(4, visible.h * scale),
          }}
          className="absolute rounded-[3px] border-[1.5px] border-primary"
        />
      )}
    </div>
  );
}
