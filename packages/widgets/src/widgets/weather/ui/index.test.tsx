// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeatherSourceError, WidgetHostProvider, type WeatherHost } from '../../../ui/host.js';
import type { WeatherObservation } from '../../../weather.js';
import { defaultWeatherConfig, type WeatherConfig } from '../definition.js';
import { Editor, WeatherContent, WeatherView, widgetUI } from './index.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE_OBSERVATION: WeatherObservation = {
  current: {
    temperature: 22.4,
    feelsLike: 21.8,
    humidity: 58,
    windSpeed: 14.2,
    condition: 'partly-cloudy',
    isDay: true,
  },
  daily: [
    {
      date: '2026-11-17',
      tempMin: 15,
      tempMax: 25,
      condition: 'partly-cloudy',
      precipitationProbability: 10,
    },
    {
      date: '2026-11-18',
      tempMin: 16,
      tempMax: 26,
      condition: 'clear',
      precipitationProbability: 0,
    },
    {
      date: '2026-11-19',
      tempMin: 14,
      tempMax: 21,
      condition: 'rain',
      precipitationProbability: 80,
    },
    {
      date: '2026-11-20',
      tempMin: 13,
      tempMax: 19,
      condition: 'cloudy',
      precipitationProbability: 30,
    },
    {
      date: '2026-11-21',
      tempMin: 15,
      tempMax: 23,
      condition: 'clear',
      precipitationProbability: 5,
    },
  ],
  location: { latitude: -23.5505, longitude: -46.6333, name: 'São Paulo' },
  unit: 'metric',
  provider: { id: 'open-meteo', attribution: 'Open-Meteo (CC BY 4.0)' },
  cache: { fetchedAt: 1000, expiresAt: 601000, hit: false },
};

function renderWithHost(
  ui: React.ReactNode,
  options: { wide?: boolean; locale?: string; weather?: Partial<WeatherHost> } = {},
) {
  const weatherHost: WeatherHost = {
    read: vi.fn(),
    listProviders: vi.fn().mockResolvedValue([
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
    ]),
    geocode: vi.fn().mockResolvedValue({ provider: 'open-meteo', results: [] }),
    ...options.weather,
  };

  return render(
    <WidgetHostProvider
      value={{
        locale: options.locale ?? 'en-US',
        wide: options.wide,
        weather: weatherHost,
        t: (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
      }}
    >
      {ui}
    </WidgetHostProvider>,
  );
}

describe('weather widget UI', () => {
  it('renders unconfigured, loading, and error states cleanly', () => {
    renderWithHost(
      <WeatherContent config={defaultWeatherConfig} reading={{ status: 'unconfigured' }} />,
    );
    expect(screen.getByText('weatherWidget.unconfigured')).toBeTruthy();

    cleanup();
    renderWithHost(
      <WeatherContent config={defaultWeatherConfig} reading={{ status: 'loading' }} />,
    );
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');

    cleanup();
    renderWithHost(
      <WeatherContent
        config={defaultWeatherConfig}
        reading={{ status: 'error', code: 'provider-not-configured' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('weatherWidget.providerNotConfigured');

    cleanup();
    renderWithHost(
      <WeatherContent
        config={defaultWeatherConfig}
        reading={{ status: 'error', code: 'rate-limited' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('weatherWidget.rateLimited');
  });

  it('displays 3-day forecast in normal mode and 5-day expanded details in wide mode', async () => {
    const config: WeatherConfig = {
      provider: 'open-meteo',
      unit: 'metric',
      latitude: -23.5505,
      longitude: -46.6333,
      locationName: 'São Paulo',
    };
    const read = vi.fn().mockResolvedValue(SAMPLE_OBSERVATION);

    renderWithHost(<WeatherView config={config} />, { wide: false, weather: { read } });
    await waitFor(() => expect(screen.getByText('22°C')).toBeTruthy());

    expect(screen.getByText('weatherWidget.condition.partly-cloudy')).toBeTruthy();
    expect(screen.getByText('São Paulo')).toBeTruthy();
    expect(screen.getByText('Open-Meteo (CC BY 4.0)')).toBeTruthy();
    const normalItems = screen.getByRole('list', { name: 'weatherWidget.forecastLabel' });
    expect(normalItems.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByText(/weatherWidget\.humidity/)).toBeNull();

    cleanup();
    const imperialObs: WeatherObservation = {
      ...SAMPLE_OBSERVATION,
      unit: 'imperial',
      current: { ...SAMPLE_OBSERVATION.current, temperature: 72, feelsLike: 71, windSpeed: 9 },
    };
    const readWide = vi.fn().mockResolvedValue(imperialObs);

    renderWithHost(<WeatherView config={{ ...config, unit: 'imperial' }} />, {
      wide: true,
      weather: { read: readWide },
    });
    await waitFor(() => expect(screen.getByText('72°F')).toBeTruthy());
    const wideItems = screen.getByRole('list', { name: 'weatherWidget.forecastLabel' });
    expect(wideItems.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText('weatherWidget.humidity:58')).toBeTruthy();
    expect(screen.getByText('weatherWidget.wind:9,mph')).toBeTruthy();
    expect(screen.getByText('weatherWidget.feelsLike:71°F')).toBeTruthy();
  });

  it('renders stale indicator when cached data is marked stale', () => {
    renderWithHost(
      <WeatherContent
        config={{
          provider: 'open-meteo',
          unit: 'metric',
          latitude: -23.5505,
          longitude: -46.6333,
          locationName: 'São Paulo',
        }}
        reading={{ status: 'ready', data: SAMPLE_OBSERVATION, stale: true }}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('weatherWidget.stale');
    expect(screen.getByText('22°C')).toBeTruthy();
  });

  it('shows provider-not-configured alert when read throws WeatherSourceError', async () => {
    const read = vi
      .fn()
      .mockRejectedValue(new WeatherSourceError('provider-not-configured', 'Missing key'));
    renderWithHost(
      <WeatherView
        config={{
          provider: 'openweathermap',
          unit: 'metric',
          latitude: 52.52,
          longitude: 13.41,
          locationName: 'Berlin',
        }}
      />,
      { weather: { read } },
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('weatherWidget.providerNotConfigured'),
    );
  });

  it('supports city search, manual coordinates, and API key management without storing keys in config', async () => {
    const onChange = vi.fn();
    const geocode = vi.fn().mockResolvedValue({
      provider: 'open-meteo',
      results: [
        {
          name: 'Berlin',
          region: 'Berlin',
          country: 'Germany',
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
        },
      ],
    });
    const saveApiKey = vi.fn().mockResolvedValue({
      id: 'openweathermap',
      label: 'OpenWeatherMap',
      requiresApiKey: true,
      configured: true,
      attribution: 'OpenWeatherMap',
    });

    renderWithHost(
      <Editor
        config={{ ...defaultWeatherConfig, provider: 'openweathermap' }}
        onChange={onChange}
      />,
      { weather: { geocode, saveApiKey } },
    );

    const searchInput = screen.getByLabelText('weatherWidget.citySearch');
    fireEvent.change(searchInput, { target: { value: 'Berlin' } });
    fireEvent.click(screen.getByRole('button', { name: 'weatherWidget.search' }));

    await waitFor(() => expect(screen.getByText('Berlin')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Berlin/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 52.52,
        longitude: 13.405,
        locationName: 'Berlin',
      }),
    );

    const keyInput = screen.getByLabelText('weatherWidget.apiKey');
    fireEvent.change(keyInput, { target: { value: 'owm-test-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'weatherWidget.saveApiKey' }));
    await waitFor(() => expect(saveApiKey).toHaveBeenCalledWith('openweathermap', 'owm-test-key'));
    expect(screen.getByRole('status').textContent).toBe('weatherWidget.apiKeySaved');

    expect(widgetUI.canSubmit?.(defaultWeatherConfig)).toBe(false);
    expect(
      widgetUI.canSubmit?.({
        ...defaultWeatherConfig,
        latitude: 52.52,
        longitude: 13.405,
      }),
    ).toBe(true);
  });

  it('shows browser geolocation button only in secure context and invokes it only on click', () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 48.8566, longitude: 2.3522 } } as GeolocationPosition);
    });

    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
      writable: true,
    });

    const onChange = vi.fn();
    renderWithHost(<Editor config={defaultWeatherConfig} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'weatherWidget.useMyLocation' })).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    cleanup();
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
      writable: true,
    });
    renderWithHost(<Editor config={defaultWeatherConfig} onChange={onChange} />);
    const geoButton = screen.getByRole('button', { name: 'weatherWidget.useMyLocation' });
    expect(getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.click(geoButton);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 48.8566, longitude: 2.3522 }),
    );
  });
});
