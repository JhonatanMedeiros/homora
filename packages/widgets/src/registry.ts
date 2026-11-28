import { widgetHealthchecksJobsWidget } from './widgets/healthchecks-jobs/definition.js';
import { widgetHomeAssistantEntitiesWidget } from './widgets/home-assistant-entities/definition.js';
import { widgetCoolifyResourcesWidget } from './widgets/coolify-resources/definition.js';
import { widgetUptimeKumaMonitorsWidget } from './widgets/uptime-kuma-monitors/definition.js';
import { widgetCertificateExpiryWidget } from './widgets/certificate-expiry/definition.js';
import { widgetMaintenanceScheduleWidget } from './widgets/maintenance-schedule/definition.js';
import { widgetQuickLinksWidget } from './widgets/quick-links/definition.js';
import { widgetLatencyHistoryWidget } from './widgets/latency-history/definition.js';
import { widgetAvailabilityWidget } from './widgets/availability/definition.js';
import { widgetDomainExpiryWidget } from './widgets/domain-expiry/definition.js';
import { widgetPublicIpWidget } from './widgets/public-ip/definition.js';
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
import { summaryWidgets } from './summary.js';

const widgets = {
  // The Summary's own come first, in its reading order.
  ...summaryWidgets,
  clock: clockWidget,
  countdown: countdownWidget,
  note: noteWidget,
  calendar: widgetCalendarWidget,
  'homelab-summary': widgetHomelabSummaryWidget,
  'recent-incidents': widgetRecentIncidentsWidget,

  'current-problems': widgetProblemsWidget,
  'rss-feed': widgetRssFeedWidget,
  weather: widgetWeatherWidget,
  'public-ip': widgetPublicIpWidget,
  'domain-expiry': widgetDomainExpiryWidget,
  'quick-links': widgetQuickLinksWidget,
  availability: widgetAvailabilityWidget,
  'latency-history': widgetLatencyHistoryWidget,

  'certificate-expiry': widgetCertificateExpiryWidget,
  'maintenance-schedule': widgetMaintenanceScheduleWidget,
  'uptime-kuma-monitors': widgetUptimeKumaMonitorsWidget,
  'coolify-resources': widgetCoolifyResourcesWidget,
  'home-assistant-entities': widgetHomeAssistantEntitiesWidget,
  'healthchecks-jobs': widgetHealthchecksJobsWidget,
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
