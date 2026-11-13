import { LayoutGrid, Map as MapIcon, Server, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ViewOptions } from '@/components/view-options';
import type { Arrange, View } from '@/hooks/use-view-preferences';
import { t } from '@/i18n';

/** Home controls for host suggestions and switching the service arrangement and density. */
export function ServiceViewToolbar({
  arrange,
  onArrangeChange,
  view,
  onViewChange,
  showDescriptions,
  onShowDescriptionsChange,
  showHostSuggestions,
  onHostSuggestions,
}: {
  arrange: Arrange;
  onArrangeChange: (value: Arrange) => void;
  view: View;
  onViewChange: (value: View) => void;
  showDescriptions: boolean;
  onShowDescriptionsChange: (value: boolean) => void;
  showHostSuggestions: boolean;
  onHostSuggestions: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showHostSuggestions && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={onHostSuggestions}
        >
          <Sparkles aria-hidden="true" />
          {t('hosts.suggest.open')}
        </Button>
      )}
      <ArrangeToggle arrange={arrange} onArrangeChange={onArrangeChange} />
      <ViewOptions
        view={view}
        onViewChange={onViewChange}
        showDescriptions={showDescriptions}
        onShowDescriptionsChange={onShowDescriptionsChange}
      />
    </div>
  );
}

/** Group / Host / Map: how the Home arranges services. */
export function ArrangeToggle({
  arrange,
  onArrangeChange,
  className,
}: {
  arrange: Arrange;
  onArrangeChange: (value: Arrange) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={arrange}
      onValueChange={(value) => {
        if (value === 'group' || value === 'host' || value === 'map') onArrangeChange(value);
      }}
      aria-label={t('hosts.arrange')}
      className={className}
    >
      <ToggleGroupItem
        value="group"
        className="h-9 gap-1.5 px-3 font-medium data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-primary pointer-coarse:h-11"
      >
        <LayoutGrid aria-hidden="true" />
        {t('hosts.arrange.group')}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="host"
        className="h-9 gap-1.5 px-3 font-medium data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-primary pointer-coarse:h-11"
      >
        <Server aria-hidden="true" />
        {t('hosts.arrange.host')}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="map"
        className="h-9 gap-1.5 px-3 font-medium data-[state=on]:bg-primary/15 data-[state=on]:font-semibold data-[state=on]:text-primary pointer-coarse:h-11"
      >
        <MapIcon aria-hidden="true" />
        {t('hosts.arrange.map')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
