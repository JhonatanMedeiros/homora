import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { MapLayout, MapRect } from '@/features/hosts/map-layout';
import { ZOOM, fitZoom } from '@/features/hosts/map-layout';

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Space the canvas keeps around the diagram (padding) and under it (the floating toolbar). */
const FIT_SIDE = 48;
const FIT_VERTICAL = 120;
/** Distance a revealed tile keeps from the edge of the viewport. */
const EDGE = 24;

/** The part of the diagram that is on screen, in map units (can reach past the diagram). */
export type VisibleRect = MapRect;

/**
 * Owns the map canvas camera: zoom, fit/reset, mouse panning, the visible rectangle for the
 * minimap, and scrolling a tile out from under the details panel. The first time the map has
 * something to draw it fits itself to the window.
 */
export function useHostMapViewport(layout: MapLayout) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const moved = useRef(false);
  const fitted = useRef(false);
  const [zoom, setZoom] = useState<number>(ZOOM.default);
  const [visible, setVisible] = useState<VisibleRect | null>(null);

  const scrollTo = (left: number, top: number, smooth = true) =>
    viewport.current?.scrollTo({
      left,
      top,
      behavior: smooth && !reducedMotion() ? 'smooth' : 'auto',
    });
  const fitValue = useCallback(() => {
    const box = viewport.current;
    return box
      ? fitZoom(layout, box.clientWidth - FIT_SIDE, box.clientHeight - FIT_VERTICAL)
      : ZOOM.default;
  }, [layout]);
  const fit = () => {
    setZoom(fitValue());
    scrollTo(0, 0);
  };
  const reset = () => {
    setZoom(ZOOM.default);
    scrollTo(0, 0);
  };

  const measure = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect();
    const diagram = content.current?.getBoundingClientRect();
    if (!box || !diagram || box.width === 0) return;
    setVisible({
      x: (box.left - diagram.left) / zoom,
      y: (box.top - diagram.top) / zoom,
      w: box.width / zoom,
      h: box.height / zoom,
    });
  }, [zoom]);

  // The first time there is something to draw, fit it: smaller when it overflows the window,
  // larger (up to `ZOOM.max`) when a wide window would leave it small.
  useLayoutEffect(() => {
    const box = viewport.current;
    if (fitted.current || !box || layout.width === 0 || box.clientWidth === 0) return;
    fitted.current = true;
    const wanted = fitValue();
    if (wanted !== ZOOM.default) setZoom(wanted);
  }, [layout, fitValue]);

  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    measure();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    box.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [measure, layout]);

  /** Centres the viewport on a point of the diagram (map units). */
  const panTo = (x: number, y: number) => {
    const box = viewport.current;
    const diagram = content.current;
    if (!box || !diagram) return;
    const view = box.getBoundingClientRect();
    const origin = diagram.getBoundingClientRect();
    scrollTo(
      box.scrollLeft + origin.left + x * zoom - (view.left + view.width / 2),
      box.scrollTop + origin.top + y * zoom - (view.top + view.height / 2),
      false,
    );
  };

  /** Scrolls the least that brings a rectangle into view, keeping `inset` free on the right. */
  const reveal = (rect: MapRect, inset = 0) => {
    const box = viewport.current;
    const diagram = content.current;
    if (!box || !diagram) return;
    const view = box.getBoundingClientRect();
    const origin = diagram.getBoundingClientRect();
    const left = origin.left + rect.x * zoom;
    const top = origin.top + rect.y * zoom;
    const right = left + rect.w * zoom;
    const bottom = top + rect.h * zoom;
    const freeRight = view.right - inset - EDGE;
    let dx = 0;
    let dy = 0;
    if (right > freeRight) dx = right - freeRight;
    if (left - dx < view.left + EDGE) dx = left - view.left - EDGE;
    if (bottom > view.bottom - FIT_VERTICAL / 2) dy = bottom - (view.bottom - FIT_VERTICAL / 2);
    if (top - dy < view.top + EDGE) dy = top - view.top - EDGE;
    if (dx !== 0 || dy !== 0) scrollTo(box.scrollLeft + dx, box.scrollTop + dy);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = viewport.current;
    if (!box || event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button'))
      return;
    moved.current = false;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: box.scrollLeft,
      top: box.scrollTop,
    };
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

  return {
    viewport,
    content,
    moved,
    zoom,
    setZoom,
    visible,
    fit,
    reset,
    panTo,
    reveal,
    onPointerDown,
    onPointerMove,
    endDrag,
  };
}
