import { widgetWeatherWidget } from './widgets/weather/definition.js';
import { widgetRssFeedWidget } from './widgets/rss-feed/definition.js';
import { widgetHomelabSummaryWidget } from './widgets/homelab-summary/definition.js';
import { widgetRecentIncidentsWidget } from './widgets/recent-incidents/definition.js';

import { widgetProblemsWidget } from './widgets/current-problems/definition.js';
import { widgetCalendarWidget } from './widgets/calendar/definition.js';
import { clockWidget } from './clock.js';
import { countdownWidget } from './countdown.js';
import { noteWidget } from './note.js';
import type { WidgetDefinition } from './index.js';

const widgets = {
  clock: clockWidget,
  countdown: countdownWidget,
  note: noteWidget,
  calendar: widgetCalendarWidget,
  'homelab-summary': widgetHomelabSummaryWidget,
  'recent-incidents': widgetRecentIncidentsWidget,

  'current-problems': widgetProblemsWidget,
  'rss-feed': widgetRssFeedWidget,
  weather: widgetWeatherWidget,
} as const;
export type LocalWidgetType = keyof typeof widgets;
export const localWidgetTypes = Object.keys(widgets) as LocalWidgetType[];

export function listWidgets(): readonly WidgetDefinition<unknown>[] {
  return localWidgetTypes.map((type) => widgets[type]);
}

export function getWidget(type: string): WidgetDefinition<unknown> | undefined {
  return Object.hasOwn(widgets, type) ? widgets[type as LocalWidgetType] : undefined;
}

export const defaultWidget = clockWidget;
