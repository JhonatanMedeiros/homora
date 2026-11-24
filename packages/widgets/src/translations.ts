import {
  en as widgetCoolifyResources,
  ptBR as widgetCoolifyResourcesPt,
} from './widgets/coolify-resources/messages.js';
import {
  en as widgetUptimeKumaMonitors,
  ptBR as widgetUptimeKumaMonitorsPt,
} from './widgets/uptime-kuma-monitors/messages.js';
import {
  en as widgetCertificateExpiry,
  ptBR as widgetCertificateExpiryPt,
} from './widgets/certificate-expiry/messages.js';
import {
  en as widgetMaintenanceSchedule,
  ptBR as widgetMaintenanceSchedulePt,
} from './widgets/maintenance-schedule/messages.js';
import {
  en as widgetQuickLinks,
  ptBR as widgetQuickLinksPt,
} from './widgets/quick-links/messages.js';
import { en as latency, ptBR as latencyPt } from './widgets/latency-history/messages.js';
import {
  en as widgetAvailability,
  ptBR as widgetAvailabilityPt,
} from './widgets/availability/messages.js';
import {
  en as widgetDomainExpiry,
  ptBR as widgetDomainExpiryPt,
} from './widgets/domain-expiry/messages.js';
import { en as widgetPublicIp, ptBR as widgetPublicIpPt } from './widgets/public-ip/messages.js';
import { en as widgetWeather, ptBR as widgetWeatherPt } from './widgets/weather/messages.js';
import { en as widgetRssFeed, ptBR as widgetRssFeedPt } from './widgets/rss-feed/messages.js';
import { en as summary, ptBR as summaryPt } from './widgets/homelab-summary/messages.js';
import { en as incidents, ptBR as incidentsPt } from './widgets/recent-incidents/messages.js';

import {
  en as widgetProblems,
  ptBR as widgetProblemsPt,
} from './widgets/current-problems/messages.js';
import { en as widgetCalendar, ptBR as widgetCalendarPt } from './widgets/calendar/messages.js';
import { en as clock, ptBR as clockPt } from './widgets/clock/messages.js';
import { en as countdown, ptBR as countdownPt } from './widgets/countdown/messages.js';
import { en as note, ptBR as notePt } from './widgets/note/messages.js';
export const widgetEnglish = {
  ...clock,
  ...countdown,
  ...note,
  ...widgetCalendar,
  ...summary,
  ...incidents,

  ...widgetProblems,
  ...widgetRssFeed,
  ...widgetWeather,
  ...widgetPublicIp,
  ...widgetDomainExpiry,
  ...widgetQuickLinks,
  ...widgetAvailability,
  ...latency,

  ...widgetCertificateExpiry,
  ...widgetMaintenanceSchedule,
  ...widgetUptimeKumaMonitors,
  ...widgetCoolifyResources,
} as const;
export const widgetPortuguese: Record<keyof typeof widgetEnglish, string> = {
  ...clockPt,
  ...countdownPt,
  ...notePt,
  ...widgetCalendarPt,
  ...summaryPt,
  ...incidentsPt,

  ...widgetProblemsPt,
  ...widgetRssFeedPt,
  ...widgetWeatherPt,
  ...widgetPublicIpPt,
  ...widgetDomainExpiryPt,
  ...widgetQuickLinksPt,
  ...widgetAvailabilityPt,
  ...latencyPt,

  ...widgetCertificateExpiryPt,
  ...widgetMaintenanceSchedulePt,
  ...widgetUptimeKumaMonitorsPt,
  ...widgetCoolifyResourcesPt,
};
