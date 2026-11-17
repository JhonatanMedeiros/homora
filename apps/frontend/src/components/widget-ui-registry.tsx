import { widgetUI as clock } from '@homora/widgets/clock/ui';
import { widgetUI as countdown } from '@homora/widgets/countdown/ui';
import { widgetUI as note } from '@homora/widgets/note/ui';
import { localWidgetTypes, type LocalWidgetType } from '@homora/widgets/registry';
import type { WidgetUI } from '@homora/widgets/ui';
import { useClockPreferences } from '@/hooks/use-clock-preferences';
import { WidgetHost } from '@/components/widget-host';

const widgets = { clock, countdown, note } satisfies Record<LocalWidgetType, WidgetUI>;
export function getWidgetUI(type: string): WidgetUI | undefined {
  return Object.hasOwn(widgets, type) ? widgets[type as LocalWidgetType] : undefined;
}
export function listWidgetUI(): [string, WidgetUI][] {
  return localWidgetTypes.map((type) => [type, widgets[type]]);
}

/** The registry binds the top-bar slot to the module and its browser-local preferences. */
export function TopBarWidget() {
  const config = useClockPreferences();
  const View = clock.View;
  return (
    <WidgetHost>
      <View config={config} />
    </WidgetHost>
  );
}
