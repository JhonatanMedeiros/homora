import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  Moon,
  Search,
  Sun,
  Wind,
} from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { FormSelect } from '@homora/ui/form-select';
import { Input } from '@homora/ui/input';
import { SelectItem } from '@homora/ui/select';
import { Skeleton } from '@homora/ui/skeleton';
import { Spinner } from '@homora/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { useWidgetHost, type WeatherErrorCode } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import type {
  WeatherConditionCode,
  WeatherLocationResult,
  WeatherProviderId,
  WeatherProviderSummary,
  WeatherUnit,
} from '../../../weather.js';
import {
  MAX_WEATHER_LOCATION_NAME_LENGTH,
  defaultWeatherConfig,
  parseWeatherCoordinate,
  widgetWeatherWidget,
  type WeatherConfig,
} from '../definition.js';
import { useWeatherReading, type WeatherReading } from './use-weather-reading.js';

function ConditionIcon({
  condition,
  isDay,
  className = 'size-5',
}: {
  condition: WeatherConditionCode;
  isDay: boolean | null;
  className?: string;
}) {
  switch (condition) {
    case 'clear':
      return isDay === false ? (
        <Moon aria-hidden="true" className={className} />
      ) : (
        <Sun aria-hidden="true" className={className} />
      );
    case 'partly-cloudy':
      return isDay === false ? (
        <CloudMoon aria-hidden="true" className={className} />
      ) : (
        <CloudSun aria-hidden="true" className={className} />
      );
    case 'cloudy':
      return <Cloud aria-hidden="true" className={className} />;
    case 'fog':
      return <CloudFog aria-hidden="true" className={className} />;
    case 'drizzle':
      return <CloudDrizzle aria-hidden="true" className={className} />;
    case 'rain':
      return <CloudRain aria-hidden="true" className={className} />;
    case 'freezing-rain':
      return <CloudHail aria-hidden="true" className={className} />;
    case 'snow':
      return <CloudSnow aria-hidden="true" className={className} />;
    case 'thunderstorm':
      return <CloudLightning aria-hidden="true" className={className} />;
    default:
      return <Cloud aria-hidden="true" className={className} />;
  }
}

function errorMessageKey(code: WeatherErrorCode): string {
  switch (code) {
    case 'provider-not-configured':
      return 'weatherWidget.providerNotConfigured';
    case 'provider-auth-failed':
      return 'weatherWidget.providerAuthFailed';
    case 'rate-limited':
      return 'weatherWidget.rateLimited';
    default:
      return 'weatherWidget.error';
  }
}

function formatTemp(value: number, unit: WeatherUnit, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
  return `${formatted}${unit === 'imperial' ? '°F' : '°C'}`;
}

function formatShortTemp(value: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
  return `${formatted}°`;
}

function formatForecastDate(dateStr: string, locale: string, wide: boolean): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat(
    locale,
    wide
      ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', timeZone: 'UTC' },
  ).format(date);
}

function formatFullForecastDate(dateStr: string, locale: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function WeatherView({ config }: { config: WeatherConfig }) {
  const { weather } = useWidgetHost();
  const reading = useWeatherReading(config, weather);
  return <WeatherContent config={config} reading={reading} />;
}

export function WeatherContent({
  config,
  reading,
}: {
  config: WeatherConfig;
  reading: WeatherReading;
}) {
  const { t, locale, wide } = useWidgetHost();

  if (reading.status === 'unconfigured') {
    return <p className="text-sm text-muted-foreground">{t('weatherWidget.unconfigured')}</p>;
  }

  if (reading.status === 'loading') {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('weatherWidget.loading')}</span>
        <div aria-hidden="true" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-8 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full motion-reduce:animate-none" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (reading.status === 'error') {
    return (
      <p role="alert" className="text-sm break-words text-destructive">
        {t(errorMessageKey(reading.code))}
      </p>
    );
  }

  const { data, stale } = reading;
  const locationLabel = config.locationName.trim() || data.location.name;
  const conditionText = t(`weatherWidget.condition.${data.current.condition}`);
  const today = data.daily[0];
  const forecastDays = data.daily.slice(0, wide ? 5 : 3);
  const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const windUnit = data.unit === 'imperial' ? 'mph' : 'km/h';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {stale && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('weatherWidget.stale')}
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ConditionIcon
            condition={data.current.condition}
            isDay={data.current.isDay}
            className="size-8 shrink-0 text-primary"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatTemp(data.current.temperature, data.unit, locale)}
              </span>
              <span className="truncate text-sm text-muted-foreground">{conditionText}</span>
            </div>
            {locationLabel && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{locationLabel}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
          {today && (
            <span
              className="tabular-nums"
              aria-label={t('weatherWidget.highLowLabel', {
                max: formatTemp(today.tempMax, data.unit, locale),
                min: formatTemp(today.tempMin, data.unit, locale),
              })}
            >
              {t('weatherWidget.highLow', {
                max: formatShortTemp(today.tempMax, locale),
                min: formatShortTemp(today.tempMin, locale),
              })}
            </span>
          )}
          {wide && data.current.feelsLike !== null && (
            <span className="tabular-nums">
              {t('weatherWidget.feelsLike', {
                temp: formatTemp(data.current.feelsLike, data.unit, locale),
              })}
            </span>
          )}
        </div>
      </div>

      {wide && (data.current.humidity !== null || data.current.windSpeed !== null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {data.current.humidity !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Droplets aria-hidden="true" className="size-3.5 shrink-0" />
              {t('weatherWidget.humidity', {
                value: numberFormatter.format(data.current.humidity),
              })}
            </span>
          )}
          {data.current.windSpeed !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Wind aria-hidden="true" className="size-3.5 shrink-0" />
              {t('weatherWidget.wind', {
                value: numberFormatter.format(Math.round(data.current.windSpeed)),
                unit: windUnit,
              })}
            </span>
          )}
        </div>
      )}

      {forecastDays.length > 0 && (
        <ul
          aria-label={t('weatherWidget.forecastLabel')}
          className={
            wide
              ? 'grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-5'
              : 'grid min-w-0 grid-cols-3 gap-1.5'
          }
        >
          {forecastDays.map((day) => {
            const dayLabel = formatForecastDate(day.date, locale, Boolean(wide));
            const fullDate = formatFullForecastDate(day.date, locale);
            const dayCondition = t(`weatherWidget.condition.${day.condition}`);
            const maxText = formatShortTemp(day.tempMax, locale);
            const minText = formatShortTemp(day.tempMin, locale);
            return (
              <li
                key={day.date}
                aria-label={t('weatherWidget.dayForecastLabel', {
                  date: fullDate,
                  condition: dayCondition,
                  max: formatTemp(day.tempMax, data.unit, locale),
                  min: formatTemp(day.tempMin, data.unit, locale),
                })}
                className="flex min-w-0 flex-col items-center gap-1 rounded-md border bg-card/50 px-2 py-1.5 text-center"
              >
                <span className="w-full truncate text-xs font-medium">{dayLabel}</span>
                <ConditionIcon
                  condition={day.condition}
                  isDay={true}
                  className="size-4 text-muted-foreground"
                />
                <span className="text-xs tabular-nums">
                  <span className="font-medium">{maxText}</span>{' '}
                  <span className="text-muted-foreground">{minText}</span>
                </span>
                {wide && day.precipitationProbability !== null && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {t('weatherWidget.precipitation', {
                      value: numberFormatter.format(day.precipitationProbability),
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="truncate text-[11px] text-muted-foreground">{data.provider.attribution}</p>
    </div>
  );
}

function isSecureGeolocationAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    typeof navigator.geolocation?.getCurrentPosition === 'function'
  );
}

const FALLBACK_PROVIDERS: WeatherProviderSummary[] = [
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
];

export function Editor({
  config,
  onChange,
}: {
  config: WeatherConfig;
  onChange: (next: WeatherConfig) => void;
}) {
  const { t, weather } = useWidgetHost();
  const [providers, setProviders] = useState<WeatherProviderSummary[]>(FALLBACK_PROVIDERS);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<WeatherLocationResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!weather?.listProviders) return;
    const controller = new AbortController();
    weather
      .listProviders(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted && list.length > 0) setProviders(list);
      })
      .catch(() => {
        // Keep fallback provider list on transient failure.
      });
    return () => controller.abort();
  }, [weather]);

  const selectedProvider = providers.find((item) => item.id === config.provider) ?? providers[0];

  const handleSaveApiKey = async () => {
    if (!weather?.saveApiKey || !apiKeyInput.trim()) return;
    setApiKeyBusy(true);
    setApiKeyMessage(null);
    try {
      const updated = await weather.saveApiKey(config.provider, apiKeyInput.trim());
      setProviders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setApiKeyInput('');
      setApiKeyMessage({ type: 'ok', text: t('weatherWidget.apiKeySaved') });
    } catch {
      setApiKeyMessage({ type: 'error', text: t('weatherWidget.apiKeyError') });
    } finally {
      setApiKeyBusy(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!weather?.clearApiKey) return;
    setApiKeyBusy(true);
    setApiKeyMessage(null);
    try {
      await weather.clearApiKey(config.provider);
      setProviders((prev) =>
        prev.map((item) =>
          item.id === config.provider ? { ...item, configured: !item.requiresApiKey } : item,
        ),
      );
      setApiKeyMessage({ type: 'ok', text: t('weatherWidget.apiKeyCleared') });
    } catch {
      setApiKeyMessage({ type: 'error', text: t('weatherWidget.apiKeyError') });
    } finally {
      setApiKeyBusy(false);
    }
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (query.length < 2 || !weather?.geocode) return;
    setSearchBusy(true);
    setSearchError(null);
    try {
      const response = await weather.geocode(
        { provider: config.provider, query, limit: 5 },
        new AbortController().signal,
      );
      setSearchResults(response.results);
    } catch {
      setSearchResults(null);
      setSearchError(t('weatherWidget.searchFailed'));
    } finally {
      setSearchBusy(false);
    }
  };

  const handleSelectLocation = (result: WeatherLocationResult) => {
    onChange({
      ...config,
      latitude: parseWeatherCoordinate(result.latitude, -90, 90),
      longitude: parseWeatherCoordinate(result.longitude, -180, 180),
      locationName: result.name.slice(0, MAX_WEATHER_LOCATION_NAME_LENGTH),
    });
    setSearchResults(null);
  };

  const handleUseCurrentLocation = () => {
    if (!isSecureGeolocationAvailable()) return;
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoBusy(false);
        onChange({
          ...config,
          latitude: parseWeatherCoordinate(position.coords.latitude, -90, 90),
          longitude: parseWeatherCoordinate(position.coords.longitude, -180, 180),
        });
      },
      () => {
        setGeoBusy(false);
        setGeoError(t('weatherWidget.geolocationFailed'));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  const showGeolocation = isSecureGeolocationAvailable();

  return (
    <>
      <Field>
        <FieldLabel htmlFor="weather-provider">{t('weatherWidget.provider')}</FieldLabel>
        <FormSelect
          id="weather-provider"
          aria-label={t('weatherWidget.provider')}
          value={config.provider}
          onChange={(event) => {
            setApiKeyMessage(null);
            onChange({ ...config, provider: event.target.value as WeatherProviderId });
          }}
        >
          {providers.map((item) => (
            <SelectItem key={item.id} value={`homora-option:${item.id}`}>
              {item.label}
            </SelectItem>
          ))}
        </FormSelect>
        {selectedProvider && (
          <div className="flex items-center gap-2 pt-1">
            <Badge variant={selectedProvider.configured ? 'secondary' : 'outline'}>
              {selectedProvider.requiresApiKey
                ? selectedProvider.configured
                  ? t('weatherWidget.providerConfigured')
                  : t('weatherWidget.providerNeedsKey')
                : t('weatherWidget.providerKeyless')}
            </Badge>
          </div>
        )}
      </Field>

      {selectedProvider?.requiresApiKey && (
        <Field>
          <FieldLabel htmlFor="weather-api-key">{t('weatherWidget.apiKey')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="weather-api-key"
              type="password"
              autoComplete="off"
              value={apiKeyInput}
              placeholder={t('weatherWidget.apiKeyPlaceholder')}
              onChange={(event) => setApiKeyInput(event.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={apiKeyBusy || !apiKeyInput.trim() || !weather?.saveApiKey}
              onClick={() => void handleSaveApiKey()}
            >
              {apiKeyBusy && <Spinner data-icon="inline-start" />}
              {t('weatherWidget.saveApiKey')}
            </Button>
            {selectedProvider.configured && weather?.clearApiKey && (
              <Button
                type="button"
                variant="outline"
                disabled={apiKeyBusy}
                onClick={() => void handleClearApiKey()}
              >
                {t('weatherWidget.clearApiKey')}
              </Button>
            )}
          </div>
          <FieldDescription>{t('weatherWidget.apiKeyHint')}</FieldDescription>
          {apiKeyMessage && (
            <p
              role={apiKeyMessage.type === 'error' ? 'alert' : 'status'}
              className={
                apiKeyMessage.type === 'error'
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              {apiKeyMessage.text}
            </p>
          )}
        </Field>
      )}

      <Field>
        <FieldLabel>{t('weatherWidget.unit')}</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t('weatherWidget.unit')}
          value={config.unit}
          onValueChange={(value) => {
            if (value === 'metric' || value === 'imperial') {
              onChange({ ...config, unit: value as WeatherUnit });
            }
          }}
        >
          <ToggleGroupItem value="metric">{t('weatherWidget.unitMetric')}</ToggleGroupItem>
          <ToggleGroupItem value="imperial">{t('weatherWidget.unitImperial')}</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      <Field>
        <FieldLabel htmlFor="weather-city-search">{t('weatherWidget.citySearch')}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="weather-city-search"
            type="search"
            value={searchQuery}
            placeholder={t('weatherWidget.citySearchPlaceholder')}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={searchBusy || searchQuery.trim().length < 2 || !weather?.geocode}
            onClick={() => void handleSearch()}
          >
            {searchBusy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Search aria-hidden="true" className="size-4" />
            )}
            {t('weatherWidget.search')}
          </Button>
        </div>

        {searchError && (
          <p role="alert" className="text-xs text-destructive">
            {searchError}
          </p>
        )}

        {searchResults && (
          <div className="flex flex-col gap-1 pt-1">
            {searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('weatherWidget.searchNoResults')}</p>
            ) : (
              searchResults.map((result, index) => {
                const detail = [result.region, result.country].filter(Boolean).join(', ');
                return (
                  <Button
                    key={`${result.latitude}:${result.longitude}:${index}`}
                    type="button"
                    variant="outline"
                    className="h-auto justify-between px-3 py-2 text-left"
                    onClick={() => handleSelectLocation(result)}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{result.name}</span>
                      {detail && <span className="text-muted-foreground"> · {detail}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {result.latitude.toFixed(2)}, {result.longitude.toFixed(2)}
                    </span>
                  </Button>
                );
              })
            )}
          </div>
        )}

        {showGeolocation && (
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={geoBusy}
              onClick={handleUseCurrentLocation}
            >
              {geoBusy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LocateFixed aria-hidden="true" className="size-4" />
              )}
              {t('weatherWidget.useMyLocation')}
            </Button>
            {geoError && (
              <p role="alert" className="pt-1 text-xs text-destructive">
                {geoError}
              </p>
            )}
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="weather-location-name">{t('weatherWidget.locationName')}</FieldLabel>
        <Input
          id="weather-location-name"
          maxLength={MAX_WEATHER_LOCATION_NAME_LENGTH}
          value={config.locationName}
          placeholder={t('weatherWidget.locationNamePlaceholder')}
          onChange={(event) => onChange({ ...config, locationName: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="weather-latitude">{t('weatherWidget.latitude')}</FieldLabel>
          <Input
            id="weather-latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            value={config.latitude ?? ''}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                onChange({ ...config, latitude: null });
                return;
              }
              const parsed = Number(raw);
              onChange({
                ...config,
                latitude: Number.isFinite(parsed) ? parsed : null,
              });
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="weather-longitude">{t('weatherWidget.longitude')}</FieldLabel>
          <Input
            id="weather-longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={config.longitude ?? ''}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                onChange({ ...config, longitude: null });
                return;
              }
              const parsed = Number(raw);
              onChange({
                ...config,
                longitude: Number.isFinite(parsed) ? parsed : null,
              });
            }}
          />
        </Field>
      </div>
      <FieldDescription>{t('weatherWidget.coordinatesHint')}</FieldDescription>
    </>
  );
}

export const widgetUI: WidgetUI = {
  name: 'pageWidgets.widgetWeather',
  description: 'pageWidgets.widgetWeatherDesc',
  category: 'utilities',
  keywords: [
    'weather',
    'forecast',
    'temperature',
    'rain',
    'clima',
    'tempo',
    'previsão',
    'temperatura',
  ],
  defaultConfig: defaultWeatherConfig,
  parse: widgetWeatherWidget.parseConfig,
  View: ({ config }) => <WeatherView config={config as WeatherConfig} />,
  Editor: ({ config, onChange }) => <Editor config={config as WeatherConfig} onChange={onChange} />,
  Gallery: () => <CloudSun aria-hidden="true" />,
  canSubmit: (config) => widgetWeatherWidget.parseConfig(config) !== null,
};
