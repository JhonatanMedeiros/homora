import { type ClockConfig } from '@homora/widgets/clock';
export {
  isTimeZone,
  defaultClockConfig as defaultClockPreferences,
  browserTimeZone,
  formatClock,
} from '@homora/widgets/clock';
export type HourFormat = ClockConfig['hourFormat'];
export type ClockPreferences = ClockConfig;

export function listTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (supported?.length) return supported.includes('UTC') ? supported : ['UTC', ...supported];
  } catch {
    // Older runtimes: fall back to the zones that matter most.
  }
  return ['UTC'];
}
