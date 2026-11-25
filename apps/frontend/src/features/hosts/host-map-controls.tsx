import { Minus, Plus, RotateCcw, Scan } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { HostMapMinimap } from '@/features/hosts/host-map-minimap';
import { ZOOM, clampZoom, type MapLayout } from '@/features/hosts/map-layout';
import type { VisibleRect } from '@/features/hosts/use-host-map-viewport';
import { t } from '@/i18n';

type Props = {
  zoom: number;
  setZoom: (update: (zoom: number) => number) => void;
  fit: () => void;
  reset: () => void;
  layout: MapLayout;
  visible: VisibleRect | null;
  problemIds: ReadonlySet<string>;
  onPan: (x: number, y: number) => void;
};

/** Zoom, Fit and Reset in the floating bar, and the minimap in the bottom-left corner. */
export function HostMapControls({
  zoom,
  setZoom,
  fit,
  reset,
  layout,
  visible,
  problemIds,
  onPan,
}: Props) {
  return (
    <>
      <HostMapMinimap
        layout={layout}
        visible={visible}
        problemIds={problemIds}
        onPan={onPan}
        className="absolute bottom-4 left-4 z-10 hidden md:block"
      />
      <div
        role="group"
        aria-label={t('map.controls')}
        className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5 shadow-md"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('map.zoomOut')}
          disabled={zoom <= ZOOM.min}
          onClick={() => setZoom((z) => clampZoom(z - ZOOM.step))}
        >
          <Minus />
        </Button>
        <span
          role="status"
          className="min-w-14 px-1 text-center font-mono text-xs tabular-nums text-muted-foreground"
        >
          {t('map.zoomLevel', { percent: Math.round(zoom * 100) })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('map.zoomIn')}
          disabled={zoom >= ZOOM.max}
          onClick={() => setZoom((z) => clampZoom(z + ZOOM.step))}
        >
          <Plus />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={fit}>
          <Scan data-icon="inline-start" />
          {t('map.fit')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw data-icon="inline-start" />
          {t('map.reset')}
        </Button>
      </div>
    </>
  );
}
