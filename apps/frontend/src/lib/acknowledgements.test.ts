import { expect, it } from 'vitest';
import { isQuiet } from './acknowledgements';

const now = 1_000_000;
const ack = (extra: Partial<Parameters<typeof isQuiet>[0] & object> = {}) => ({
  incidentId: null,
  acknowledgedAt: now - 10,
  mutedUntil: null,
  ...extra,
});

it('is not quiet without a mark', () => {
  expect(isQuiet(undefined, 5, now)).toBe(false);
});

it('holds an acknowledgement for the same incident only', () => {
  expect(isQuiet(ack({ incidentId: 5 }), 5, now)).toBe(true);
  // A new incident speaks up again.
  expect(isQuiet(ack({ incidentId: 5 }), 6, now)).toBe(false);
  expect(isQuiet(ack({ incidentId: 5 }), null, now)).toBe(false);
});

it('holds a mute until its time, whatever the incident', () => {
  expect(isQuiet(ack({ mutedUntil: now + 1 }), 9, now)).toBe(true);
  expect(isQuiet(ack({ mutedUntil: now }), 9, now)).toBe(false);
});

it('an acknowledgement without an incident or mute quiets nothing', () => {
  expect(isQuiet(ack(), 5, now)).toBe(false);
});
