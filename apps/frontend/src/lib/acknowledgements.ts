export type Acknowledgement = {
  incidentId: number | null;
  acknowledgedAt: number;
  mutedUntil: number | null;
};

/**
 * Does the mark still quiet this service? A mute holds until its time; an acknowledgement holds for
 * the incident that was seen, so a new incident speaks up again.
 */
export function isQuiet(
  ack: Acknowledgement | undefined,
  currentIncidentId: number | null | undefined,
  now: number,
): boolean {
  if (!ack) return false;
  if (ack.mutedUntil !== null && ack.mutedUntil > now) return true;
  return ack.incidentId !== null && ack.incidentId === currentIncidentId;
}
