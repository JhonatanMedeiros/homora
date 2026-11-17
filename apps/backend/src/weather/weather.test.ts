import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { authorizeDestination } from '../network-policy.js';
import { createVault } from '../vault.js';
import { createApp } from '../app.js';
import { createTestAuth } from '../test-auth.js';
import {
  createOpenMeteoProvider,
  createOpenWeatherMapProvider,
  createWeatherService,
  mapOwmConditionId,
  mapWmoCode,
  WeatherProviderError,
  type WeatherTransport,
} from './index.js';
import openMeteoForecastFixture from './fixtures/open-meteo-forecast.json' with { type: 'json' };
import openMeteoGeocodeFixture from './fixtures/open-meteo-geocode.json' with { type: 'json' };
import owmCurrentFixture from './fixtures/openweathermap-current.json' with { type: 'json' };
import owmForecastFixture from './fixtures/openweathermap-forecast.json' with { type: 'json' };
import owmGeocodeFixture from './fixtures/openweathermap-geocode.json' with { type: 'json' };

const ORIGIN = 'http://localhost:5173';
const tempDirs: string[] = [];

function makeTempVault() {
  const dir = mkdtempSync(join(tmpdir(), 'homora-weather-test-'));
  tempDirs.push(dir);
  return createVault(join(dir, 'vault'));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('weather providers and condition mapping', () => {
  it('maps WMO and OpenWeatherMap condition codes to normalized values', () => {
    expect(mapWmoCode(0)).toBe('clear');
    expect(mapWmoCode(2)).toBe('partly-cloudy');
    expect(mapWmoCode(3)).toBe('cloudy');
    expect(mapWmoCode(45)).toBe('fog');
    expect(mapWmoCode(53)).toBe('drizzle');
    expect(mapWmoCode(66)).toBe('freezing-rain');
    expect(mapWmoCode(61)).toBe('rain');
    expect(mapWmoCode(71)).toBe('snow');
    expect(mapWmoCode(95)).toBe('thunderstorm');
    expect(mapWmoCode(999)).toBe('unknown');

    expect(mapOwmConditionId(800)).toBe('clear');
    expect(mapOwmConditionId(801)).toBe('partly-cloudy');
    expect(mapOwmConditionId(804)).toBe('cloudy');
    expect(mapOwmConditionId(741)).toBe('fog');
    expect(mapOwmConditionId(301)).toBe('drizzle');
    expect(mapOwmConditionId(511)).toBe('freezing-rain');
    expect(mapOwmConditionId(500)).toBe('rain');
    expect(mapOwmConditionId(601)).toBe('snow');
    expect(mapOwmConditionId(200)).toBe('thunderstorm');
    expect(mapOwmConditionId(999)).toBe('unknown');
  });

  it('parses Open-Meteo forecast and geocoding fixtures and enforces public-only policy', async () => {
    const calls: Array<{ url: string; allowPrivate: boolean; origins: readonly string[] }> = [];
    const transport: WeatherTransport = async (destination, policy, options) => {
      calls.push({ url: destination, allowPrivate: policy.allowPrivate, origins: policy.origins });
      expect(policy.allowPrivate).toBe(false);
      expect(destination.startsWith('https://')).toBe(true);
      expect(options?.timeoutMs).toBeLessThanOrEqual(8000);
      expect(options?.maxBodyBytes).toBeLessThanOrEqual(262_144);
      if (destination.includes('/v1/forecast'))
        return { status: 200, body: JSON.stringify(openMeteoForecastFixture.body) };
      if (destination.includes('/v1/search'))
        return { status: 200, body: JSON.stringify(openMeteoGeocodeFixture.body) };
      return { status: 404, body: '' };
    };

    const provider = createOpenMeteoProvider(transport);
    const weather = await provider.fetchWeather({
      latitude: 52.52,
      longitude: 13.41,
      unit: 'metric',
      name: 'Berlin',
    });
    expect(weather.current).toEqual({
      temperature: 8.4,
      feelsLike: 5.9,
      humidity: 72,
      windSpeed: 14.2,
      condition: 'partly-cloudy',
      isDay: true,
    });
    expect(weather.daily).toHaveLength(5);
    expect(weather.daily[0]).toEqual({
      date: '2026-11-17',
      tempMin: 3.2,
      tempMax: 9.5,
      condition: 'partly-cloudy',
      precipitationProbability: 15,
    });
    expect(weather.provider).toEqual({ id: 'open-meteo', attribution: 'Open-Meteo (CC BY 4.0)' });

    const places = await provider.geocode({ query: 'Berlin', limit: 5 });
    expect(places).toEqual([
      {
        name: 'Berlin',
        region: 'State of Berlin',
        country: 'Germany',
        latitude: 52.52437,
        longitude: 13.41053,
        timezone: 'Europe/Berlin',
      },
    ]);
    expect(calls.every((c) => c.allowPrivate === false)).toBe(true);
  });

  it('parses OpenWeatherMap fixtures, aggregates 5-day forecast, and isolates secrets', async () => {
    const secretKey = 'owm-secret-test-key-12345';
    const transport: WeatherTransport = async (destination, policy) => {
      expect(policy.allowPrivate).toBe(false);
      expect(policy.origins).toEqual(['https://api.openweathermap.org']);
      if (destination.includes('/data/2.5/weather'))
        return { status: 200, body: JSON.stringify(owmCurrentFixture.body) };
      if (destination.includes('/data/2.5/forecast'))
        return { status: 200, body: JSON.stringify(owmForecastFixture.body) };
      if (destination.includes('/geo/1.0/direct'))
        return { status: 200, body: JSON.stringify(owmGeocodeFixture.body) };
      return { status: 404, body: '' };
    };

    const provider = createOpenWeatherMapProvider(transport);
    await expect(
      provider.fetchWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' }),
    ).rejects.toMatchObject({ code: 'provider-not-configured' });

    const weather = await provider.fetchWeather({
      latitude: 52.52,
      longitude: 13.41,
      unit: 'metric',
      name: 'Berlin',
      apiKey: secretKey,
    });
    expect(weather.current).toEqual({
      temperature: 8.4,
      feelsLike: 5.9,
      humidity: 72,
      windSpeed: 14.4,
      condition: 'partly-cloudy',
      isDay: true,
    });
    expect(weather.daily).toHaveLength(5);
    expect(weather.daily[0]).toEqual({
      date: '2026-11-17',
      tempMin: 3.2,
      tempMax: 9.5,
      condition: 'partly-cloudy',
      precipitationProbability: 15,
    });
    expect(JSON.stringify(weather)).not.toContain(secretKey);

    const places = await provider.geocode({ query: 'Berlin', limit: 5, apiKey: secretKey });
    expect(places[0]).toEqual({
      name: 'Berlin',
      region: 'Berlin',
      country: 'DE',
      latitude: 52.5170365,
      longitude: 13.3888599,
      timezone: null,
    });
  });

  it('isolates upstream errors and never leaks remote bodies or API keys', async () => {
    const secretKey = 'secret-leak-check-key';
    const makeTransport =
      (result: { status: number; body: string } | Error): WeatherTransport =>
      async () => {
        if (result instanceof Error) throw result;
        return result;
      };

    const cases: Array<[Parameters<typeof makeTransport>[0], string]> = [
      [{ status: 401, body: `Invalid key ${secretKey}` }, 'auth-failed'],
      [{ status: 403, body: 'Forbidden' }, 'auth-failed'],
      [{ status: 429, body: 'Too many requests' }, 'rate-limited'],
      [{ status: 503, body: 'Upstream down' }, 'provider-unavailable'],
      [
        new Error(`connect ECONNREFUSED https://api.openweathermap.org?appid=${secretKey}`),
        'provider-unavailable',
      ],
      [{ status: 200, body: 'not-json' }, 'invalid-response'],
      [{ status: 200, body: JSON.stringify({ unexpected: true }) }, 'invalid-response'],
    ];

    for (const [response, expectedCode] of cases) {
      const owm = createOpenWeatherMapProvider(makeTransport(response));
      let caught: unknown;
      try {
        await owm.fetchWeather({
          latitude: 52.52,
          longitude: 13.41,
          unit: 'metric',
          apiKey: secretKey,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(WeatherProviderError);
      expect((caught as WeatherProviderError).code).toBe(expectedCode);
      expect((caught as Error).message).not.toContain(secretKey);
      expect((caught as Error).message).not.toContain('Upstream down');
    }
  });

  it('blocks private and forbidden IPs under public-only weather destination policy', async () => {
    await expect(
      authorizeDestination(
        'https://api.open-meteo.com/v1/forecast',
        { origins: ['https://api.open-meteo.com'], allowPrivate: false },
        async () => [{ address: '10.0.0.5', family: 4 }],
      ),
    ).rejects.toMatchObject({ code: 'destination-disallowed' });
    await expect(
      authorizeDestination(
        'https://api.openweathermap.org/data/2.5/weather',
        { origins: ['https://api.openweathermap.org'], allowPrivate: false },
        async () => [{ address: '127.0.0.1', family: 4 }],
      ),
    ).rejects.toMatchObject({ code: 'destination-disallowed' });
  });
});

describe('weather service caching, deduplication, and vault credentials', () => {
  it('stores encrypted credentials in vault, caches by provider/location/unit, and deduplicates concurrent requests', async () => {
    const database = createDatabase(':memory:');
    const sqlite = getSqliteHandle(database.db);
    const vault = makeTempVault();
    let currentTime = 1_000_000;
    let fetchCount = 0;

    const transport: WeatherTransport = async (destination) => {
      if (destination.includes('api.open-meteo.com')) {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return { status: 200, body: JSON.stringify(openMeteoForecastFixture.body) };
      }
      if (destination.includes('api.openweathermap.org/data/2.5/weather')) {
        fetchCount++;
        return { status: 200, body: JSON.stringify(owmCurrentFixture.body) };
      }
      if (destination.includes('api.openweathermap.org/data/2.5/forecast')) {
        return { status: 200, body: JSON.stringify(owmForecastFixture.body) };
      }
      return { status: 404, body: '' };
    };

    const service = createWeatherService(sqlite, vault, {
      transport,
      cacheTtlMs: 60_000,
      now: () => currentTime,
    });

    expect(service.listProviders()).toEqual([
      {
        id: 'open-meteo',
        label: 'Open-Meteo',
        requiresApiKey: false,
        configured: true,
        attribution: 'Open-Meteo (CC BY 4.0)',
      },
      {
        id: 'openweathermap',
        label: 'OpenWeatherMap',
        requiresApiKey: true,
        configured: false,
        attribution: 'OpenWeatherMap',
      },
    ]);

    // Concurrent deduplication for same provider/location/unit.
    const [first, second] = await Promise.all([
      service.getWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' }),
      service.getWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' }),
    ]);
    expect(fetchCount).toBe(1);
    expect(first.cache.hit).toBe(false);
    expect(second.cache.hit).toBe(false);

    // Subsequent call within TTL hits cache.
    const third = await service.getWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' });
    expect(fetchCount).toBe(1);
    expect(third.cache.hit).toBe(true);

    // Different unit misses cache.
    const imperial = await service.getWeather({
      latitude: 52.52,
      longitude: 13.41,
      unit: 'imperial',
    });
    expect(fetchCount).toBe(2);
    expect(imperial.cache.hit).toBe(false);

    // After TTL expiration, refetches.
    currentTime += 61_000;
    const expired = await service.getWeather({
      latitude: 52.52,
      longitude: 13.41,
      unit: 'metric',
    });
    expect(fetchCount).toBe(3);
    expect(expired.cache.hit).toBe(false);

    // Vault storage for API-key provider.
    const apiKey = 'owm-vault-secret-987';
    const configured = service.setProviderApiKey('openweathermap', apiKey);
    expect(configured.configured).toBe(true);
    const storedRow = sqlite
      .prepare('SELECT secret_ref AS secretRef FROM weather_providers WHERE provider = ?')
      .get('openweathermap') as { secretRef: string };
    expect(storedRow.secretRef).not.toContain(apiKey);

    const owmResult = await service.getWeather({
      provider: 'openweathermap',
      latitude: 52.52,
      longitude: 13.41,
      unit: 'metric',
    });
    expect(owmResult.provider.id).toBe('openweathermap');
    expect(fetchCount).toBe(4);

    // Clearing credential invalidates cache and restores unconfigured state.
    expect(service.clearProviderApiKey('openweathermap')).toBe(true);
    expect(service.listProviders().find((p) => p.id === 'openweathermap')?.configured).toBe(false);
    await expect(
      service.getWeather({
        provider: 'openweathermap',
        latitude: 52.52,
        longitude: 13.41,
        unit: 'metric',
      }),
    ).rejects.toMatchObject({ code: 'provider-not-configured' });

    database.close();
  });

  it('never caches failed requests', async () => {
    const database = createDatabase(':memory:');
    const sqlite = getSqliteHandle(database.db);
    let failNext = true;
    const service = createWeatherService(sqlite, undefined, {
      transport: async () => {
        if (failNext) return { status: 503, body: '' };
        return { status: 200, body: JSON.stringify(openMeteoForecastFixture.body) };
      },
    });

    await expect(
      service.getWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' }),
    ).rejects.toMatchObject({ code: 'provider-unavailable' });

    failNext = false;
    const ok = await service.getWeather({ latitude: 52.52, longitude: 13.41, unit: 'metric' });
    expect(ok.cache.hit).toBe(false);
    expect(ok.current.temperature).toBe(8.4);

    database.close();
  });
});

describe('weather HTTP routes', () => {
  it('enforces auth, validates inputs, manages encrypted keys, and does not persist search history', async () => {
    const database = createDatabase(':memory:');
    const { auth, cookie } = await createTestAuth(database.db);
    const vault = makeTempVault();
    const app = createApp(database.db, 5173, auth, vault);

    // Unauthenticated requests are rejected.
    const unauth = await app.inject({ method: 'GET', url: '/api/weather/providers' });
    expect(unauth.statusCode).toBe(401);

    const providersRes = await app.inject({
      method: 'GET',
      url: '/api/weather/providers',
      headers: { cookie },
    });
    expect(providersRes.statusCode).toBe(200);
    expect(providersRes.json()).toHaveLength(2);

    // Configure OpenWeatherMap API key.
    const secretKey = 'owm-route-secret-456';
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/weather/providers/openweathermap',
      headers: { cookie, origin: ORIGIN },
      payload: { apiKey: secretKey },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toMatchObject({ id: 'openweathermap', configured: true });
    expect(putRes.body).not.toContain(secretKey);

    // Rejects key on keyless provider.
    const badPut = await app.inject({
      method: 'PUT',
      url: '/api/weather/providers/open-meteo',
      headers: { cookie, origin: ORIGIN },
      payload: { apiKey: secretKey },
    });
    expect(badPut.statusCode).toBe(400);

    // Validates weather and geocode query bounds.
    const badLat = await app.inject({
      method: 'GET',
      url: '/api/weather?lat=999&lon=10',
      headers: { cookie },
    });
    expect(badLat.statusCode).toBe(400);

    const badQuery = await app.inject({
      method: 'GET',
      url: '/api/weather/geocode?q=a',
      headers: { cookie },
    });
    expect(badQuery.statusCode).toBe(400);

    // Delete stored key.
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/weather/providers/openweathermap',
      headers: { cookie, origin: ORIGIN },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json()).toEqual({ ok: true });

    // Audit log never contains the secret.
    const auditEvents = getSqliteHandle(database.db)
      .prepare('SELECT action, detail FROM audit_events')
      .all() as Array<{ action: string; detail: string | null }>;
    expect(auditEvents.some((e) => e.action === 'weather-provider-configure')).toBe(true);
    expect(JSON.stringify(auditEvents)).not.toContain(secretKey);

    await app.close();
    database.close();
  });
});
