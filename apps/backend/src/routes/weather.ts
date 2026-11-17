import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { WEATHER_PROVIDER_IDS, WEATHER_UNITS } from '@homora/widgets';
import { InputError, errorBody } from '../api-error.js';
import type { AuditLog } from '../audit.js';
import type { createAuth } from '../auth.js';
import { createWeatherService, WeatherProviderError } from '../weather/index.js';

const providerParamSchema = z.object({ provider: z.enum(WEATHER_PROVIDER_IDS) }).strict();
const apiKeyBodySchema = z.object({ apiKey: z.string().trim().min(1).max(256) }).strict();

const weatherQuerySchema = z
  .object({
    provider: z.enum(WEATHER_PROVIDER_IDS).default('open-meteo'),
    lat: z.coerce.number().finite().min(-90).max(90),
    lon: z.coerce.number().finite().min(-180).max(180),
    unit: z.enum(WEATHER_UNITS).default('metric'),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const geocodeQuerySchema = z
  .object({
    provider: z.enum(WEATHER_PROVIDER_IDS).default('open-meteo'),
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(5).default(5),
  })
  .strict();

function sendWeatherError(reply: FastifyReply, error: unknown) {
  if (error instanceof InputError) return reply.code(400).send(errorBody(error.code));
  if (error instanceof WeatherProviderError) {
    switch (error.code) {
      case 'provider-not-configured':
        return reply.code(400).send(errorBody('weather-provider-not-configured'));
      case 'auth-failed':
        return reply.code(502).send(errorBody('weather-provider-auth-failed'));
      case 'rate-limited':
        return reply.code(429).send(errorBody('weather-rate-limited'));
      case 'provider-unavailable':
      case 'invalid-response':
        return reply.code(502).send(errorBody('weather-provider-unavailable'));
    }
  }
  return reply.code(502).send(errorBody('weather-provider-unavailable'));
}

export function registerWeatherRoutes(
  app: FastifyInstance,
  weather: ReturnType<typeof createWeatherService>,
  auth: ReturnType<typeof createAuth>,
  audit: AuditLog,
) {
  app.get('/api/weather/providers', async () => weather.listProviders());

  app.put<{ Params: { provider: string } }>(
    '/api/weather/providers/:provider',
    async (request, reply) => {
      const session = await auth.session(request.headers);
      if (!session) return reply.code(401).send(errorBody('auth-required'));
      const params = providerParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(errorBody('invalid-weather-provider'));
      const body = apiKeyBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(errorBody('invalid-weather-api-key'));
      try {
        const updated = weather.setProviderApiKey(params.data.provider, body.data.apiKey);
        audit.record({
          actor: `user:${session.userId}`,
          action: 'weather-provider-configure',
          result: 'ok',
          detail: params.data.provider,
          ipAddress: request.ip,
        });
        return updated;
      } catch (error) {
        return sendWeatherError(reply, error);
      }
    },
  );

  app.delete<{ Params: { provider: string } }>(
    '/api/weather/providers/:provider',
    async (request, reply) => {
      const session = await auth.session(request.headers);
      if (!session) return reply.code(401).send(errorBody('auth-required'));
      const params = providerParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(errorBody('invalid-weather-provider'));
      try {
        weather.clearProviderApiKey(params.data.provider);
        audit.record({
          actor: `user:${session.userId}`,
          action: 'weather-provider-clear',
          result: 'ok',
          detail: params.data.provider,
          ipAddress: request.ip,
        });
        return { ok: true };
      } catch (error) {
        return sendWeatherError(reply, error);
      }
    },
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/api/weather/geocode',
    async (request, reply) => {
      const query = geocodeQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      try {
        return await weather.searchLocations({
          provider: query.data.provider,
          query: query.data.q,
          limit: query.data.limit,
        });
      } catch (error) {
        return sendWeatherError(reply, error);
      }
    },
  );

  app.get<{ Querystring: Record<string, string> }>('/api/weather', async (request, reply) => {
    const query = weatherQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
    try {
      return await weather.getWeather({
        provider: query.data.provider,
        latitude: query.data.lat,
        longitude: query.data.lon,
        unit: query.data.unit,
        name: query.data.name,
      });
    } catch (error) {
      return sendWeatherError(reply, error);
    }
  });
}
