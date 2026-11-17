import type { WidgetSource } from './index.js';

/** Versioned weather source contract. The host owns providers, credentials, transport and cache. */
export const weatherSources = {
  weather: { contract: 'homora:weather', version: 1 },
} as const satisfies Record<string, WidgetSource>;

export function isWeatherSource(source: WidgetSource | null): boolean {
  return (
    source !== null &&
    Object.values(weatherSources).some(
      (candidate) => candidate.contract === source.contract && candidate.version === source.version,
    )
  );
}

export const WEATHER_PROVIDER_IDS = ['open-meteo', 'openweathermap'] as const;
export type WeatherProviderId = (typeof WEATHER_PROVIDER_IDS)[number];

export const WEATHER_UNITS = ['metric', 'imperial'] as const;
export type WeatherUnit = (typeof WEATHER_UNITS)[number];

export const WEATHER_CONDITION_CODES = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'freezing-rain',
  'snow',
  'thunderstorm',
  'unknown',
] as const;
export type WeatherConditionCode = (typeof WEATHER_CONDITION_CODES)[number];

export const WEATHER_MAX_FORECAST_DAYS = 5;

export type WeatherCurrent = {
  temperature: number;
  feelsLike: number | null;
  humidity: number | null;
  /** Wind speed in km/h for metric or mph for imperial. */
  windSpeed: number | null;
  condition: WeatherConditionCode;
  isDay: boolean | null;
};

export type WeatherDailyForecast = {
  /** Calendar date in YYYY-MM-DD format. */
  date: string;
  tempMin: number;
  tempMax: number;
  condition: WeatherConditionCode;
  /** Precipitation probability as an integer percentage (0-100). */
  precipitationProbability: number | null;
};

export type WeatherObservation = {
  current: WeatherCurrent;
  daily: WeatherDailyForecast[];
  location: {
    latitude: number;
    longitude: number;
    name: string | null;
  };
  unit: WeatherUnit;
  provider: {
    id: WeatherProviderId;
    attribution: string;
  };
  cache: {
    fetchedAt: number;
    expiresAt: number;
    hit: boolean;
  };
};

export type WeatherLocationResult = {
  name: string;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export type WeatherGeocodeResponse = {
  provider: WeatherProviderId;
  results: WeatherLocationResult[];
};

export type WeatherProviderSummary = {
  id: WeatherProviderId;
  label: string;
  requiresApiKey: boolean;
  configured: boolean;
  attribution: string;
};
