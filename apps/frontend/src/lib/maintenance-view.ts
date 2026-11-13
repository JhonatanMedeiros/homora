import { MAINTENANCE_MAX_MS, MAINTENANCE_MIN_MS } from '@homora/shared';

const pad = (value: number) => String(value).padStart(2, '0');
/** The value a `datetime-local` input takes: local time, minutes precision. */
export const toLocalInput = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
/** Epoch milliseconds of a `datetime-local` value; NaN when it is incomplete. */
export const fromLocalInput = (value: string) => new Date(value).getTime();

/** Is this a window the server will accept: after its start, between a minute and 30 days. */
export function validWindow(startsAt: number, endsAt: number) {
  const length = endsAt - startsAt;
  return Number.isFinite(length) && length >= MAINTENANCE_MIN_MS && length <= MAINTENANCE_MAX_MS;
}
