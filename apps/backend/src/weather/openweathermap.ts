import { z } from 'zod';
import {
  WEATHER_MAX_FORECAST_DAYS,
  type WeatherConditionCode,
  type WeatherDailyForecast,
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

const OWM_ORIGIN = 'https://api.openweathermap.org';
const OWM_POLICY: DestinationPolicy = { origins: [OWM_ORIGIN], allowPrivate: false };

const finiteNumber = z.number().finite();

const currentResponseSchema = z.object({
  weather: z
    .array(
      z.object({
        id: z.number().int(),
        icon: z.string().max(16).optional(),
      }),
    )
    .min(1),
  main: z.object({
    temp: finiteNumber,
    feels_like: finiteNumber.optional(),
    humidity: finiteNumber.min(0).max(100).optional(),
  }),
  wind: z
    .object({
      speed: finiteNumber.min(0).optional(),
    })
    .optional(),
  dt: finiteNumber.optional(),
  sys: z
    .object({
      sunrise: finiteNumber.optional(),
      sunset: finiteNumber.optional(),
    })
    .optional(),
});

const forecastResponseSchema = z.object({
  list: z
    .array(
      z.object({
        dt: finiteNumber,
        main: z.object({
          temp_min: finiteNumber,
          temp_max: finiteNumber,
        }),
        weather: z.array(z.object({ id: z.number().int() })).min(1),
        pop: finiteNumber.min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(48),
  city: z
    .object({
      timezone: finiteNumber.optional(),
    })
    .optional(),
});

const geocodeResponseSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      state: z.string().trim().max(120).optional(),
      country: z.string().trim().max(120).optional(),
      lat: finiteNumber.min(-90).max(90),
      lon: finiteNumber.min(-180).max(180),
    }),
  )
  .max(20);

/** Maps OpenWeatherMap weather condition IDs (v2.5) to normalized condition codes. */
export function mapOwmConditionId(id: number): WeatherConditionCode {
  if (id >= 200 && id <= 232) return 'thunderstorm';
  if (id >= 300 && id <= 321) return 'drizzle';
  if (id === 511) return 'freezing-rain';
  if (id >= 500 && id <= 531) return 'rain';
  if (id >= 600 && id <= 622) return 'snow';
  if (id >= 701 && id <= 781) return 'fog';
  if (id === 800) return 'clear';
  if (id === 801 || id === 802) return 'partly-cloudy';
  if (id === 803 || id === 804) return 'cloudy';
  return 'unknown';
}

function aggregateDailyForecast(
  entries: z.infer<typeof forecastResponseSchema>['list'],
  timezoneOffsetSeconds: number,
): WeatherDailyForecast[] {
  const byDate = new Map<
    string,
    Array<{
      hour: number;
      tempMin: number;
      tempMax: number;
      conditionId: number;
      pop: number | undefined;
    }>
  >();

  for (const entry of entries) {
    const localDate = new Date((entry.dt + timezoneOffsetSeconds) * 1000);
    const dateKey = localDate.toISOString().slice(0, 10);
    const hour = localDate.getUTCHours();
    const bucket = byDate.get(dateKey) ?? [];
    bucket.push({
      hour,
      tempMin: entry.main.temp_min,
      tempMax: entry.main.temp_max,
      conditionId: entry.weather[0].id,
      pop: entry.pop,
    });
    byDate.set(dateKey, bucket);
  }

  const days: WeatherDailyForecast[] = [];
  for (const [date, slots] of byDate) {
    if (days.length >= WEATHER_MAX_FORECAST_DAYS) break;
    const tempMin = Math.min(...slots.map((s) => s.tempMin));
    const tempMax = Math.max(...slots.map((s) => s.tempMax));
    const pops = slots.map((s) => s.pop).filter((p): p is number => p !== undefined);
    const precipitationProbability = pops.length > 0 ? Math.round(Math.max(...pops) * 100) : null;
    const middaySlot = slots.reduce((best, slot) =>
      Math.abs(slot.hour - 12) < Math.abs(best.hour - 12) ? slot : best,
    );
    days.push({
      date,
      tempMin,
      tempMax,
      condition: mapOwmConditionId(middaySlot.conditionId),
      precipitationProbability,
    });
  }
  return days;
}

export function createOpenWeatherMapProvider(transport: WeatherTransport): WeatherProviderAdapter {
  return {
    id: 'openweathermap',
    label: 'OpenWeatherMap',
    requiresApiKey: true,
    attribution: 'OpenWeatherMap',
    allowedOrigins: [OWM_ORIGIN],

    async fetchWeather({
      latitude,
      longitude,
      unit,
      name,
      apiKey,
    }): Promise<Omit<WeatherObservation, 'cache'>> {
      if (!apiKey) throw new WeatherProviderError('provider-not-configured');

      const currentUrl = new URL('/data/2.5/weather', OWM_ORIGIN);
      currentUrl.searchParams.set('lat', latitude.toFixed(4));
      currentUrl.searchParams.set('lon', longitude.toFixed(4));
      currentUrl.searchParams.set('units', unit);
      currentUrl.searchParams.set('appid', apiKey);

      const forecastUrl = new URL('/data/2.5/forecast', OWM_ORIGIN);
      forecastUrl.searchParams.set('lat', latitude.toFixed(4));
      forecastUrl.searchParams.set('lon', longitude.toFixed(4));
      forecastUrl.searchParams.set('units', unit);
      forecastUrl.searchParams.set('cnt', '40');
      forecastUrl.searchParams.set('appid', apiKey);

      const [rawCurrent, rawForecast] = await Promise.all([
        fetchWeatherJson(transport, currentUrl.href, OWM_POLICY),
        fetchWeatherJson(transport, forecastUrl.href, OWM_POLICY),
      ]);

      const currentParsed = currentResponseSchema.safeParse(rawCurrent);
      const forecastParsed = forecastResponseSchema.safeParse(rawForecast);
      if (!currentParsed.success || !forecastParsed.success)
        throw new WeatherProviderError('invalid-response');

      const cur = currentParsed.data;
      const fc = forecastParsed.data;
      const daily = aggregateDailyForecast(fc.list, fc.city?.timezone ?? 0);
      if (daily.length === 0) throw new WeatherProviderError('invalid-response');

      const rawSpeed = cur.wind?.speed;
      const windSpeed =
        rawSpeed === undefined
          ? null
          : unit === 'metric'
            ? Math.round(rawSpeed * 3.6 * 10) / 10
            : rawSpeed;

      let isDay: boolean | null = null;
      if (cur.dt !== undefined && cur.sys?.sunrise !== undefined && cur.sys?.sunset !== undefined) {
        isDay = cur.dt >= cur.sys.sunrise && cur.dt < cur.sys.sunset;
      } else if (cur.weather[0].icon) {
        if (cur.weather[0].icon.endsWith('d')) isDay = true;
        else if (cur.weather[0].icon.endsWith('n')) isDay = false;
      }

      return {
        current: {
          temperature: cur.main.temp,
          feelsLike: cur.main.feels_like ?? null,
          humidity: cur.main.humidity === undefined ? null : Math.round(cur.main.humidity),
          windSpeed,
          condition: mapOwmConditionId(cur.weather[0].id),
          isDay,
        },
        daily,
        location: {
          latitude,
          longitude,
          name: name ?? null,
        },
        unit,
        provider: {
          id: 'openweathermap',
          attribution: 'OpenWeatherMap',
        },
      };
    },

    async geocode({ query, limit, apiKey }): Promise<WeatherLocationResult[]> {
      if (!apiKey) throw new WeatherProviderError('provider-not-configured');

      const url = new URL('/geo/1.0/direct', OWM_ORIGIN);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('appid', apiKey);

      const raw = await fetchWeatherJson(transport, url.href, OWM_POLICY);
      const parsed = geocodeResponseSchema.safeParse(raw);
      if (!parsed.success) throw new WeatherProviderError('invalid-response');

      return parsed.data.slice(0, limit).map((item) => ({
        name: item.name,
        region: item.state ?? null,
        country: item.country ?? null,
        latitude: item.lat,
        longitude: item.lon,
        timezone: null,
      }));
    },
  };
}
