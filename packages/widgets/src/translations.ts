import { en as summary, ptBR as summaryPt } from './widgets/homelab-summary/messages.js';
import { en as incidents, ptBR as incidentsPt } from './widgets/recent-incidents/messages.js';
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
} as const;
export const widgetPortuguese: Record<keyof typeof widgetEnglish, string> = {
  ...clockPt,
  ...countdownPt,
  ...notePt,
  ...widgetCalendarPt,
  ...summaryPt,
  ...incidentsPt,
};
