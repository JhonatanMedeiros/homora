import { useRef, useState, type PointerEvent } from 'react';
import type { MapLayout } from '@/features/hosts/map-layout';
import { ZOOM, fitZoom } from '@/features/hosts/map-layout';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Owns the map canvas camera: zoom, fit/reset, and mouse panning. */
export function useHostMapViewport(layout: MapLayout) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const moved = useRef(false);
  const [zoom, setZoom] = useState<number>(ZOOM.default);

  const scrollTo = (left: number, top: number) =>
    viewport.current?.scrollTo({ left, top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const fit = () => {
    const box = viewport.current;
    const next = box ? fitZoom(layout, box.clientWidth, box.clientHeight) : ZOOM.default;
    setZoom(next);
    scrollTo(0, 0);
  };
  const reset = () => {
    setZoom(ZOOM.default);
    scrollTo(0, 0);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = viewport.current;
    if (!box || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button'))
      return;
    moved.current = false;
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const box = viewport.current;
    if (!start || !box) return;
    if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4)
      moved.current = true;
    box.scrollLeft = start.left - (event.clientX - start.x);
    box.scrollTop = start.top - (event.clientY - start.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return { viewport, moved, zoom, setZoom, fit, reset, onPointerDown, onPointerMove, endDrag };
}
