import { z } from 'zod';
import {
  WEATHER_MAX_FORECAST_DAYS,
  type WeatherConditionCode,
  type WeatherLocationResult,
  type WeatherObservation,
} from '@homora/widgets';
import type { DestinationPolicy } from '../network-policy.js';
import {
  fetchWeatherJson,
  WeatherProviderError,
  type WeatherProviderAdapter,
  type WeatherTransport,
} from './types.js';

const FORECAST_ORIGIN = 'https://api.open-meteo.com';
const GEOCODE_ORIGIN = 'https://geocoding-api.open-meteo.com';

const FORECAST_POLICY: DestinationPolicy = { origins: [FORECAST_ORIGIN], allowPrivate: false };
const GEOCODE_POLICY: DestinationPolicy = { origins: [GEOCODE_ORIGIN], allowPrivate: false };

const finiteNumber = z.number().finite();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const forecastResponseSchema = z.object({
  latitude: finiteNumber,
  longitude: finiteNumber,
  current: z.object({
    temperature_2m: finiteNumber,
    relative_humidity_2m: finiteNumber.min(0).max(100).nullable().optional(),
    apparent_temperature: finiteNumber.nullable().optional(),
    is_day: z
      .union([z.literal(0), z.literal(1)])
      .nullable()
      .optional(),
    weather_code: finiteNumber,
    wind_speed_10m: finiteNumber.min(0).nullable().optional(),
  }),
  daily: z.object({
    time: z.array(dateString).min(1).max(16),
    weather_code: z.array(finiteNumber).min(1).max(16),
    temperature_2m_max: z.array(finiteNumber).min(1).max(16),
    temperature_2m_min: z.array(finiteNumber).min(1).max(16),
    precipitation_probability_max: z
      .array(finiteNumber.min(0).max(100).nullable())
      .max(16)
      .optional(),
  }),
});

const geocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        admin1: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
        latitude: finiteNumber.min(-90).max(90),
        longitude: finiteNumber.min(-180).max(180),
        timezone: z.string().trim().max(80).optional(),
      }),
    )
    .max(20)
    .optional(),
});

/** Maps WMO Weather Interpretation Codes (WW) used by Open-Meteo v1 to normalized conditions. */
export function mapWmoCode(code: number): WeatherConditionCode {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'freezing-rain';
  if (code === 61 || code === 63 || code === 65 || code === 80 || code === 81 || code === 82)
    return 'rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86)
    return 'snow';
  if (code === 95 || code === 96 || code === 99) return 'thunderstorm';
  return 'unknown';
}

export function createOpenMeteoProvider(transport: WeatherTransport): WeatherProviderAdapter {
  return {
    id: 'open-meteo',
    label: 'Open-Meteo',
    requiresApiKey: false,
    attribution: 'Open-Meteo (CC BY 4.0)',
    allowedOrigins: [FORECAST_ORIGIN, GEOCODE_ORIGIN],

    async fetchWeather({
      latitude,
      longitude,
      unit,
      name,
    }): Promise<Omit<WeatherObservation, 'cache'>> {
      const url = new URL('/v1/forecast', FORECAST_ORIGIN);
      url.searchParams.set('latitude', latitude.toFixed(4));
      url.searchParams.set('longitude', longitude.toFixed(4));
      url.searchParams.set(
        'current',
        'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
      );
      url.searchParams.set(
        'daily',
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      );
      url.searchParams.set('forecast_days', String(WEATHER_MAX_FORECAST_DAYS));
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('temperature_unit', unit === 'imperial' ? 'fahrenheit' : 'celsius');
      url.searchParams.set('wind_speed_unit', unit === 'imperial' ? 'mph' : 'kmh');

      const raw = await fetchWeatherJson(transport, url.href, FORECAST_POLICY);
      const parsed = forecastResponseSchema.safeParse(raw);
      if (!parsed.success) throw new WeatherProviderError('invalid-response');

      const { current, daily } = parsed.data;
      const dayCount = Math.min(
        WEATHER_MAX_FORECAST_DAYS,
        daily.time.length,
        daily.weather_code.length,
        daily.temperature_2m_max.length,
        daily.temperature_2m_min.length,
      );
      if (dayCount < 1) throw new WeatherProviderError('invalid-response');

      const forecast = Array.from({ length: dayCount }, (_, i) => {
        const precip = daily.precipitation_probability_max?.[i];
        return {
          date: daily.time[i],
          tempMin: daily.temperature_2m_min[i],
          tempMax: daily.temperature_2m_max[i],
          condition: mapWmoCode(daily.weather_code[i]),
          precipitationProbability:
            precip === undefined || precip === null ? null : Math.round(precip),
        };
      });

      return {
        current: {
          temperature: current.temperature_2m,
          feelsLike: current.apparent_temperature ?? null,
          humidity:
            current.relative_humidity_2m === undefined || current.relative_humidity_2m === null
              ? null
              : Math.round(current.relative_humidity_2m),
          windSpeed: current.wind_speed_10m ?? null,
          condition: mapWmoCode(current.weather_code),
          isDay:
            current.is_day === undefined || current.is_day === null ? null : current.is_day === 1,
        },
        daily: forecast,
        location: {
          latitude,
          longitude,
          name: name ?? null,
        },
        unit,
        provider: {
          id: 'open-meteo',
          attribution: 'Open-Meteo (CC BY 4.0)',
        },
      };
    },

    async geocode({ query, limit }): Promise<WeatherLocationResult[]> {
      const url = new URL('/v1/search', GEOCODE_ORIGIN);
      url.searchParams.set('name', query);
      url.searchParams.set('count', String(limit));
      url.searchParams.set('language', 'en');
      url.searchParams.set('format', 'json');

      const raw = await fetchWeatherJson(transport, url.href, GEOCODE_POLICY);
      const parsed = geocodeResponseSchema.safeParse(raw);
      if (!parsed.success) throw new WeatherProviderError('invalid-response');

      return (parsed.data.results ?? []).slice(0, limit).map((item) => ({
        name: item.name,
        region: item.admin1 ?? null,
        country: item.country ?? null,
        latitude: item.latitude,
        longitude: item.longitude,
        timezone: item.timezone ?? null,
      }));
    },
  };
}
