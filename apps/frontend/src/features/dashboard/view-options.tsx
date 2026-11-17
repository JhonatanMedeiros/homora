import { LayoutGrid, LayoutList, Rows3 } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Label } from '@homora/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { Switch } from '@homora/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { UPTIME_RANGES, type UptimeRange } from '@homora/shared';
import { t } from '@/i18n';
import type { View } from '@/features/dashboard/use-view-preferences';

type Props = {
  view: View;
  onViewChange: (view: View) => void;
  showDescriptions: boolean;
  onShowDescriptionsChange: (show: boolean) => void;
  /** Period of the uptime bar and percentage on every card. */
  uptimeRange?: UptimeRange;
  onUptimeRangeChange?: (range: UptimeRange) => void;
};

/** One button for how services are displayed; descriptions only exist in cards view. */
export function ViewOptions({
  view,
  onViewChange,
  showDescriptions,
  onShowDescriptionsChange,
  uptimeRange,
  onUptimeRangeChange,
}: Props) {
  const Icon = view === 'cards' ? LayoutGrid : view === 'list' ? LayoutList : Rows3;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="pointer-coarse:h-11">
          <Icon aria-hidden="true" />
          {t('view.display')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-60 flex-col gap-3">
        <ViewLayoutFields
          view={view}
          onViewChange={onViewChange}
          showDescriptions={showDescriptions}
          onShowDescriptionsChange={onShowDescriptionsChange}
          uptimeRange={uptimeRange}
          onUptimeRangeChange={onUptimeRangeChange}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Layout toggle and descriptions switch, shared by the View popover and the mobile options sheet. */
export function ViewLayoutFields({
  view,
  onViewChange,
  showDescriptions,
  onShowDescriptionsChange,
  uptimeRange,
  onUptimeRangeChange,
}: Props) {
  return (
    <>
      <p className="font-mono text-xs text-muted-foreground">{t('view.layout')}</p>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={view}
        onValueChange={(value) => {
          if (value === 'tiles' || value === 'list' || value === 'cards') onViewChange(value);
        }}
        aria-label={t('view.layout')}
        className="w-full"
      >
        <ToggleGroupItem value="tiles" className="flex-1 pointer-coarse:h-11">
          {t('view.compact')}
        </ToggleGroupItem>
        <ToggleGroupItem value="list" className="flex-1 pointer-coarse:h-11">
          {t('view.list')}
        </ToggleGroupItem>
        <ToggleGroupItem value="cards" className="flex-1 pointer-coarse:h-11">
          {t('view.cards')}
        </ToggleGroupItem>
      </ToggleGroup>
      {view === 'cards' ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="view-descriptions">{t('view.showDescriptions')}</Label>
          <Switch
            id="view-descriptions"
            checked={showDescriptions}
            onCheckedChange={onShowDescriptionsChange}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('view.descriptionsHint')}</p>
      )}
      {uptimeRange && onUptimeRangeChange && (
        <>
          <p className="font-mono text-xs text-muted-foreground">{t('uptime.range')}</p>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={uptimeRange}
            onValueChange={(value) => {
              const next = UPTIME_RANGES.find((item) => item === value);
              if (next) onUptimeRangeChange(next);
            }}
            aria-label={t('uptime.range')}
            className="w-full"
          >
            {UPTIME_RANGES.map((item) => (
              <ToggleGroupItem key={item} value={item} className="flex-1 pointer-coarse:h-11">
                {t(`uptime.range.${item}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </>
      )}
    </>
  );
}
