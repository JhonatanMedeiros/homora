import { widgetUI as widgetPublicIp } from '@homora/widgets/public-ip/ui';
import { widgetUI as widgetWeather } from '@homora/widgets/weather/ui';
import { widgetUI as widgetRssFeed } from '@homora/widgets/rss-feed/ui';
import { widgetUI as summary } from '@homora/widgets/homelab-summary/ui';
import { widgetUI as incidents } from '@homora/widgets/recent-incidents/ui';

import { widgetUI as widgetProblems } from '@homora/widgets/current-problems/ui';
import { widgetUI as widgetCalendar } from '@homora/widgets/calendar/ui';
import { widgetUI as clock } from '@homora/widgets/clock/ui';
import { widgetUI as countdown } from '@homora/widgets/countdown/ui';
import { widgetUI as note } from '@homora/widgets/note/ui';
import { localWidgetTypes, type LocalWidgetType } from '@homora/widgets/registry';
import type { WidgetUI } from '@homora/widgets/ui';
import { useClockPreferences } from '@/hooks/use-clock-preferences';
import { WidgetHost } from '@/components/widget-host';

const widgets = {
  clock,
  countdown,
  note,
  calendar: widgetCalendar,
  'homelab-summary': summary,
  'recent-incidents': incidents,

  'current-problems': widgetProblems,
  'rss-feed': widgetRssFeed,
  weather: widgetWeather,
  'public-ip': widgetPublicIp,
} satisfies Record<LocalWidgetType, WidgetUI>;
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
