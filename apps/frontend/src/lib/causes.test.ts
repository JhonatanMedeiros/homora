import { expect, it } from 'vitest';
import { groupCauses, SAME_TIME_WINDOW_MS, type CauseInput } from './causes';

const down = (id: number, extra: Partial<CauseInput> = {}): CauseInput => ({
  id,
  down: true,
  reason: 'error-status',
  httpStatus: 502,
  since: 1_000_000,
  ...extra,
});

it('returns nothing when nothing is down', () => {
  expect(groupCauses([])).toEqual([]);
  expect(groupCauses([{ id: 1, down: false }])).toEqual([]);
});

it('puts stopped guests and offline hosts first, from the host link', () => {
  const causes = groupCauses([
    down(1, { impact: 'guest-stopped', reason: 'no-response', httpStatus: null }),
    down(2, { impact: 'guest-stopped', reason: 'no-response', httpStatus: null }),
    down(3, { impact: 'host-offline' }),
  ]);
  expect(causes.map((cause) => [cause.kind, cause.ids])).toEqual([
    ['guest-stopped', [1, 2]],
    ['host-offline', [3]],
  ]);
});

it('groups services that fail with the same error at about the same time', () => {
  const causes = groupCauses([
    down(1),
    down(2, { since: 1_000_000 + 60_000 }),
    down(3, { since: 1_000_000 + SAME_TIME_WINDOW_MS }),
    down(4, { httpStatus: 500 }),
  ]);
  const same = causes.find((cause) => cause.kind === 'same-error');
  expect(same).toMatchObject({ ids: [1, 2, 3], reason: 'error-status', httpStatus: 502 });
  // A different code is a different problem.
  expect(causes.find((cause) => cause.ids.includes(4))?.kind).toBe('other');
});

it('does not join failures that started far apart', () => {
  const causes = groupCauses([down(1), down(2, { since: 1_000_000 + SAME_TIME_WINDOW_MS + 1 })]);
  // Not read as one event: they land in the catch-all, never as a "same error" cause.
  expect(causes.some((cause) => cause.kind === 'same-error')).toBe(false);
  expect(causes.flatMap((cause) => cause.ids).sort()).toEqual([1, 2]);
});

it('keeps silent hosts together and orders the biggest cause first', () => {
  const causes = groupCauses([
    down(1, { reason: 'no-response', httpStatus: null }),
    down(2, { reason: 'no-response', httpStatus: null }),
    down(3),
    down(4),
    down(5),
  ]);
  expect(causes.map((cause) => [cause.kind, cause.ids.length])).toEqual([
    ['same-error', 3],
    ['no-response', 2],
  ]);
});

it('keeps a stable key while the same services share the same problem', () => {
  const first = groupCauses([down(1), down(2)])[0]!;
  const again = groupCauses([down(2), down(1)])[0]!;
  expect(first.ids.slice().sort()).toEqual(again.ids.slice().sort());
  expect(first.kind).toBe(again.kind);
  expect(first.since).toBe(1_000_000);
});

it('treats an unknown start as the same event instead of splitting', () => {
  const causes = groupCauses([down(1, { since: null }), down(2, { since: 5_000_000 })]);
  expect(causes).toHaveLength(1);
  expect(causes[0]!.kind).toBe('same-error');
});
