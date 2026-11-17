import type {
  WeatherLocationResult,
  WeatherObservation,
  WeatherProviderId,
  WeatherUnit,
} from '@homora/widgets';
import type { DestinationPolicy } from '../network-policy.js';
import type { AuthorizedResponse, RequestOptions } from '../network-request.js';

export type WeatherTransport = (
  destination: string,
  policy: DestinationPolicy,
  options?: RequestOptions,
) => Promise<AuthorizedResponse>;

export type WeatherErrorCode =
  | 'provider-not-configured'
  | 'auth-failed'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'invalid-response';

const ERROR_MESSAGES: Record<WeatherErrorCode, string> = {
  'provider-not-configured': 'Weather provider credentials are not configured.',
  'auth-failed': 'Weather provider rejected credentials.',
  'rate-limited': 'Weather provider rate limit exceeded.',
  'provider-unavailable': 'Weather provider is unavailable.',
  'invalid-response': 'Weather provider returned an invalid response.',
};

export class WeatherProviderError extends Error {
  readonly code: WeatherErrorCode;
  constructor(code: WeatherErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WeatherProviderError';
    this.code = code;
  }
}

export type WeatherFetchParams = {
  latitude: number;
  longitude: number;
  unit: WeatherUnit;
  name?: string | null;
  apiKey?: string;
};

export type WeatherGeocodeParams = {
  query: string;
  limit: number;
  apiKey?: string;
};

export type WeatherProviderAdapter = {
  readonly id: WeatherProviderId;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly attribution: string;
  readonly allowedOrigins: readonly string[];
  fetchWeather(params: WeatherFetchParams): Promise<Omit<WeatherObservation, 'cache'>>;
  geocode(params: WeatherGeocodeParams): Promise<WeatherLocationResult[]>;
};

export const WEATHER_TIMEOUT_MS = 6000;
export const WEATHER_MAX_BODY_BYTES = 131_072; // 128 KB

/**
 * Executes a bounded public-only GET request through the restricted transport and parses JSON.
 * Never echoes remote URLs, query parameters, credentials, or upstream response bodies in errors.
 */
export async function fetchWeatherJson(
  transport: WeatherTransport,
  destination: string,
  policy: DestinationPolicy,
): Promise<unknown> {
  if (policy.allowPrivate) throw new Error('Weather providers must not access private networks.');
  let response: AuthorizedResponse;
  try {
    response = await transport(destination, policy, {
      timeoutMs: WEATHER_TIMEOUT_MS,
      maxBodyBytes: WEATHER_MAX_BODY_BYTES,
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof WeatherProviderError) throw error;
    throw new WeatherProviderError('provider-unavailable');
  }
  if (response.status === 401 || response.status === 403)
    throw new WeatherProviderError('auth-failed');
  if (response.status === 429) throw new WeatherProviderError('rate-limited');
  if (response.status !== 200) throw new WeatherProviderError('provider-unavailable');
  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new WeatherProviderError('invalid-response');
  }
}
