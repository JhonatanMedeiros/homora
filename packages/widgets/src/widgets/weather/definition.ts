import { defineWidget } from '../../index.js';
import {
  WEATHER_PROVIDER_IDS,
  WEATHER_UNITS,
  weatherSources,
  type WeatherProviderId,
  type WeatherUnit,
} from '../../weather.js';

export const MAX_WEATHER_LOCATION_NAME_LENGTH = 120;

export type WeatherConfig = {
  provider: WeatherProviderId;
  unit: WeatherUnit;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
};

export const defaultWeatherConfig: WeatherConfig = {
  provider: 'open-meteo',
  unit: 'metric',
  latitude: null,
  longitude: null,
  locationName: '',
};

const ALLOWED_KEYS = new Set(['provider', 'unit', 'latitude', 'longitude', 'locationName']);

export function parseWeatherCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return Math.round(value * 10000) / 10000;
}

export function isWeatherLocationConfigured(config: WeatherConfig): boolean {
  return (
    parseWeatherCoordinate(config.latitude, -90, 90) !== null &&
    parseWeatherCoordinate(config.longitude, -180, 180) !== null
  );
}

export const widgetWeatherWidget = defineWidget<WeatherConfig>({
  type: 'weather',
  version: 1,
  locations: ['page'],
  sizes: ['normal', 'wide'],
  source: weatherSources.weather,
  portable: true,
  defaultConfig: defaultWeatherConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !ALLOWED_KEYS.has(key))) return null;

    if (
      typeof config.provider !== 'string' ||
      !(WEATHER_PROVIDER_IDS as readonly string[]).includes(config.provider)
    ) {
      return null;
    }

    if (
      typeof config.unit !== 'string' ||
      !(WEATHER_UNITS as readonly string[]).includes(config.unit)
    ) {
      return null;
    }

    const latitude = parseWeatherCoordinate(config.latitude, -90, 90);
    const longitude = parseWeatherCoordinate(config.longitude, -180, 180);
    if (latitude === null || longitude === null) return null;

    if (config.locationName !== undefined && typeof config.locationName !== 'string') return null;
    const locationName = typeof config.locationName === 'string' ? config.locationName.trim() : '';
    if (locationName.length > MAX_WEATHER_LOCATION_NAME_LENGTH) return null;

    return {
      provider: config.provider as WeatherProviderId,
      unit: config.unit as WeatherUnit,
      latitude,
      longitude,
      locationName,
    };
  },
});
