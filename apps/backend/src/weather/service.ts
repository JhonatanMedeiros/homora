import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  WEATHER_CONDITION_CODES,
  WEATHER_MAX_FORECAST_DAYS,
  WEATHER_PROVIDER_IDS,
  WEATHER_UNITS,
  type WeatherGeocodeResponse,
  type WeatherLocationResult,
  type WeatherObservation,
  type WeatherProviderId,
  type WeatherProviderSummary,
  type WeatherUnit,
} from '@homora/widgets';
import { InputError } from '../api-error.js';
import { getAuthorizedResponse } from '../network-request.js';
import type { createVault } from '../vault.js';
import { createOpenMeteoProvider } from './open-meteo.js';
import { createOpenWeatherMapProvider } from './openweathermap.js';
import {
  WeatherProviderError,
  type WeatherProviderAdapter,
  type WeatherTransport,
} from './types.js';

type Vault = ReturnType<typeof createVault>;

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;
const API_KEY_PATTERN = /^[\x21-\x7E]{1,256}$/;

const sealedSecretSchema = z.object({ apiKey: z.string().regex(API_KEY_PATTERN) }).strict();

const observationSchema: z.ZodType<WeatherObservation> = z
  .object({
    current: z
      .object({
        temperature: z.number().finite(),
        feelsLike: z.number().finite().nullable(),
        humidity: z.number().int().min(0).max(100).nullable(),
        windSpeed: z.number().finite().min(0).nullable(),
        condition: z.enum(WEATHER_CONDITION_CODES),
        isDay: z.boolean().nullable(),
      })
      .strict(),
    daily: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            tempMin: z.number().finite(),
            tempMax: z.number().finite(),
            condition: z.enum(WEATHER_CONDITION_CODES),
            precipitationProbability: z.number().int().min(0).max(100).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(WEATHER_MAX_FORECAST_DAYS),
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        name: z.string().max(120).nullable(),
      })
      .strict(),
    unit: z.enum(WEATHER_UNITS),
    provider: z
      .object({
        id: z.enum(WEATHER_PROVIDER_IDS),
        attribution: z.string().min(1).max(120),
      })
      .strict(),
    cache: z
      .object({
        fetchedAt: z.number().int().nonnegative(),
        expiresAt: z.number().int().nonnegative(),
        hit: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type WeatherServiceOptions = {
  transport?: WeatherTransport;
  cacheTtlMs?: number;
  now?: () => number;
};

type CachedWeather = {
  value: Omit<WeatherObservation, 'cache'>;
  fetchedAt: number;
  expiresAt: number;
};

export function createWeatherService(
  db: DatabaseSync,
  vault?: Vault,
  options: WeatherServiceOptions = {},
) {
  const transport = options.transport ?? getAuthorizedResponse;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;

  const providers = new Map<WeatherProviderId, WeatherProviderAdapter>([
    ['open-meteo', createOpenMeteoProvider(transport)],
    ['openweathermap', createOpenWeatherMapProvider(transport)],
  ]);

  const cache = new Map<string, CachedWeather>();
  const pendingWeather = new Map<string, Promise<CachedWeather>>();
  const pendingGeocode = new Map<string, Promise<WeatherLocationResult[]>>();
  const providerGeneration = new Map<WeatherProviderId, number>();

  const generationOf = (provider: WeatherProviderId) => providerGeneration.get(provider) ?? 0;

  function invalidateProvider(provider: WeatherProviderId) {
    providerGeneration.set(provider, generationOf(provider) + 1);
    const prefix = `${provider}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }

  function getProvider(id: WeatherProviderId): WeatherProviderAdapter {
    const adapter = providers.get(id);
    if (!adapter) throw new InputError('invalid-weather-provider');
    return adapter;
  }

  function hasStoredKey(provider: WeatherProviderId): boolean {
    const row = db.prepare('SELECT 1 FROM weather_providers WHERE provider = ?').get(provider);
    return Boolean(row);
  }

  function readApiKey(provider: WeatherProviderId): string | undefined {
    const adapter = getProvider(provider);
    if (!adapter.requiresApiKey) return undefined;
    const row = db
      .prepare('SELECT secret_ref AS secretRef FROM weather_providers WHERE provider = ?')
      .get(provider) as { secretRef: string } | undefined;
    if (!row) throw new WeatherProviderError('provider-not-configured');
    if (!vault) throw new WeatherProviderError('provider-not-configured');
    let parsed: unknown;
    try {
      parsed = JSON.parse(vault.unseal(row.secretRef)) as unknown;
    } catch {
      throw new WeatherProviderError('provider-not-configured');
    }
    const secret = sealedSecretSchema.safeParse(parsed);
    if (!secret.success) throw new WeatherProviderError('provider-not-configured');
    return secret.data.apiKey;
  }

  function listProviders(): WeatherProviderSummary[] {
    return [...providers.values()].map((p) => ({
      id: p.id,
      label: p.label,
      requiresApiKey: p.requiresApiKey,
      configured: !p.requiresApiKey || hasStoredKey(p.id),
      attribution: p.attribution,
    }));
  }

  function setProviderApiKey(
    provider: WeatherProviderId,
    rawApiKey: string,
  ): WeatherProviderSummary {
    const adapter = getProvider(provider);
    if (!adapter.requiresApiKey) throw new InputError('weather-provider-keyless');
    const apiKey = rawApiKey.trim();
    if (!API_KEY_PATTERN.test(apiKey)) throw new InputError('invalid-weather-api-key');
    if (!vault) throw new InputError('vault-unavailable');
    const sealed = vault.seal(JSON.stringify({ apiKey }), true);
    const timestamp = now();
    db.prepare(
      'INSERT INTO weather_providers(provider, secret_ref, updated_at) VALUES(?, ?, ?) ON CONFLICT(provider) DO UPDATE SET secret_ref = excluded.secret_ref, updated_at = excluded.updated_at',
    ).run(provider, sealed, timestamp);
    invalidateProvider(provider);
    return {
      id: adapter.id,
      label: adapter.label,
      requiresApiKey: adapter.requiresApiKey,
      configured: true,
      attribution: adapter.attribution,
    };
  }

  function clearProviderApiKey(provider: WeatherProviderId): boolean {
    const adapter = getProvider(provider);
    if (!adapter.requiresApiKey) throw new InputError('weather-provider-keyless');
    const result = db.prepare('DELETE FROM weather_providers WHERE provider = ?').run(provider);
    invalidateProvider(provider);
    return result.changes > 0;
  }

  async function getWeather(params: {
    provider?: WeatherProviderId;
    latitude: number;
    longitude: number;
    unit?: WeatherUnit;
    name?: string | null;
  }): Promise<WeatherObservation> {
    const providerId = params.provider ?? 'open-meteo';
    const unit = params.unit ?? 'metric';
    const adapter = getProvider(providerId);
    const latKey = params.latitude.toFixed(3);
    const lonKey = params.longitude.toFixed(3);
    const cacheKey = `${providerId}:${latKey}:${lonKey}:${unit}`;
    const currentTime = now();

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > currentTime) {
      return observationSchema.parse({
        ...cached.value,
        location: {
          ...cached.value.location,
          name: params.name ?? cached.value.location.name,
        },
        cache: {
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          hit: true,
        },
      });
    }

    let request = pendingWeather.get(cacheKey);
    if (!request) {
      const apiKey = readApiKey(providerId);
      const gen = generationOf(providerId);
      request = (async () => {
        const value = await adapter.fetchWeather({
          latitude: params.latitude,
          longitude: params.longitude,
          unit,
          name: params.name ?? null,
          apiKey,
        });
        const fetchedAt = now();
        const entry: CachedWeather = {
          value,
          fetchedAt,
          expiresAt: fetchedAt + cacheTtlMs,
        };
        if (generationOf(providerId) === gen) {
          if (cache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey !== undefined) cache.delete(oldestKey);
          }
          cache.set(cacheKey, entry);
        }
        return entry;
      })();
      pendingWeather.set(cacheKey, request);
      try {
        const result = await request;
        return observationSchema.parse({
          ...result.value,
          location: {
            ...result.value.location,
            name: params.name ?? result.value.location.name,
          },
          cache: {
            fetchedAt: result.fetchedAt,
            expiresAt: result.expiresAt,
            hit: false,
          },
        });
      } finally {
        if (pendingWeather.get(cacheKey) === request) pendingWeather.delete(cacheKey);
      }
    }

    const shared = await request;
    return observationSchema.parse({
      ...shared.value,
      location: {
        ...shared.value.location,
        name: params.name ?? shared.value.location.name,
      },
      cache: {
        fetchedAt: shared.fetchedAt,
        expiresAt: shared.expiresAt,
        hit: false,
      },
    });
  }

  async function searchLocations(params: {
    provider?: WeatherProviderId;
    query: string;
    limit?: number;
  }): Promise<WeatherGeocodeResponse> {
    const providerId = params.provider ?? 'open-meteo';
    const adapter = getProvider(providerId);
    const query = params.query.trim();
    const limit = Math.min(5, Math.max(1, params.limit ?? 5));
    const key = `${providerId}:${limit}:${query.toLowerCase()}`;

    let request = pendingGeocode.get(key);
    if (!request) {
      const apiKey = readApiKey(providerId);
      request = adapter.geocode({ query, limit, apiKey });
      pendingGeocode.set(key, request);
      try {
        const results = await request;
        return { provider: providerId, results };
      } finally {
        if (pendingGeocode.get(key) === request) pendingGeocode.delete(key);
      }
    }

    const results = await request;
    return { provider: providerId, results };
  }

  return {
    listProviders,
    setProviderApiKey,
    clearProviderApiKey,
    getWeather,
    searchLocations,
  };
}
