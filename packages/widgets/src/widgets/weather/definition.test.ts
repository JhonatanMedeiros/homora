import { describe, expect, it } from 'vitest';
import { isPortableWidget, isWeatherSource } from '../../index.js';
import {
  MAX_WEATHER_LOCATION_NAME_LENGTH,
  defaultWeatherConfig,
  isWeatherLocationConfigured,
  widgetWeatherWidget,
} from './definition.js';

describe('weather widget definition', () => {
  it('validates explicit location, provider, and unit configuration', () => {
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: -23.5505,
        longitude: -46.6333,
        locationName: '  São Paulo  ',
      }),
    ).toEqual({
      provider: 'open-meteo',
      unit: 'metric',
      latitude: -23.5505,
      longitude: -46.6333,
      locationName: 'São Paulo',
    });

    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'openweathermap',
        unit: 'imperial',
        latitude: 40.7128,
        longitude: -74.006,
      }),
    ).toEqual({
      provider: 'openweathermap',
      unit: 'imperial',
      latitude: 40.7128,
      longitude: -74.006,
      locationName: '',
    });
  });

  it('rejects missing coordinates, out-of-range values, unknown providers, and extra fields', () => {
    expect(widgetWeatherWidget.parseConfig(defaultWeatherConfig)).toBeNull();
    expect(widgetWeatherWidget.parseConfig(null)).toBeNull();
    expect(widgetWeatherWidget.parseConfig([])).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'unknown',
        unit: 'metric',
        latitude: 0,
        longitude: 0,
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'kelvin',
        latitude: 0,
        longitude: 0,
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: 91,
        longitude: 0,
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: 0,
        longitude: -181,
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: Number.NaN,
        longitude: 0,
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: 0,
        longitude: 0,
        locationName: 'a'.repeat(MAX_WEATHER_LOCATION_NAME_LENGTH + 1),
      }),
    ).toBeNull();
    expect(
      widgetWeatherWidget.parseConfig({
        provider: 'open-meteo',
        unit: 'metric',
        latitude: 0,
        longitude: 0,
        apiKey: 'secret',
      }),
    ).toBeNull();
  });

  it('declares normal and wide sizes, weather source contract, and portability', () => {
    expect(widgetWeatherWidget.sizes).toEqual(['normal', 'wide']);
    expect(isWeatherSource(widgetWeatherWidget.source)).toBe(true);
    expect(isPortableWidget(widgetWeatherWidget)).toBe(true);
    expect(isWeatherLocationConfigured(defaultWeatherConfig)).toBe(false);
    expect(
      isWeatherLocationConfigured({
        ...defaultWeatherConfig,
        latitude: 52.52,
        longitude: 13.41,
      }),
    ).toBe(true);
  });
});
