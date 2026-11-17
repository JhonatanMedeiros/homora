import { useEffect, useState } from 'react';
import { WeatherSourceError, type WeatherErrorCode, type WeatherHost } from '../../../ui/host.js';
import type { WeatherObservation, WeatherProviderId, WeatherUnit } from '../../../weather.js';
import { parseWeatherCoordinate, type WeatherConfig } from '../definition.js';

export type WeatherReading =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; code: WeatherErrorCode }
  | { status: 'ready'; data: WeatherObservation; stale: boolean };

const REFRESH_INTERVAL_MS = 10 * 60_000;

type WeatherQueryKey = {
  provider: WeatherProviderId;
  unit: WeatherUnit;
  latitude: number;
  longitude: number;
  name: string;
};

function resolveErrorCode(error: unknown): WeatherErrorCode {
  if (error instanceof WeatherSourceError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (
      code === 'provider-not-configured' ||
      code === 'provider-auth-failed' ||
      code === 'rate-limited' ||
      code === 'provider-unavailable'
    ) {
      return code;
    }
  }
  return 'provider-unavailable';
}

export function useWeatherReading(
  config: WeatherConfig,
  weatherHost: WeatherHost | undefined,
): WeatherReading {
  const latitude = parseWeatherCoordinate(config.latitude, -90, 90);
  const longitude = parseWeatherCoordinate(config.longitude, -180, 180);
  const key =
    latitude !== null && longitude !== null
      ? JSON.stringify({
          provider: config.provider,
          unit: config.unit,
          latitude,
          longitude,
          name: config.locationName.trim(),
        } satisfies WeatherQueryKey)
      : '';

  const [state, setState] = useState<{
    key: string;
    data: WeatherObservation | null;
    error: WeatherErrorCode | null;
  }>({ key, data: null, error: null });

  useEffect(() => {
    if (!key) return;
    const current = JSON.parse(key) as WeatherQueryKey;
    let active = true;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!weatherHost) {
          throw new WeatherSourceError('provider-unavailable', 'Weather source unavailable');
        }
        const data = await weatherHost.read(
          {
            provider: current.provider,
            latitude: current.latitude,
            longitude: current.longitude,
            unit: current.unit,
            ...(current.name ? { name: current.name } : {}),
          },
          request.signal,
        );
        if (active && !request.signal.aborted) {
          setState({ key, data, error: null });
        }
      } catch (err) {
        if (!active || request.signal.aborted) return;
        const code = resolveErrorCode(err);
        if (code === 'provider-not-configured' || code === 'provider-auth-failed') {
          setState({ key, data: null, error: code });
          return;
        }
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : null,
          error: code,
        }));
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, weatherHost]);

  if (!key) return { status: 'unconfigured' };
  if (state.key !== key) return { status: 'loading' };
  if (!state.data) {
    return state.error ? { status: 'error', code: state.error } : { status: 'loading' };
  }
  return {
    status: 'ready',
    data: state.data,
    stale: state.error !== null,
  };
}
