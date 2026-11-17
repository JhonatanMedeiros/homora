import { expect, it } from 'vitest';
import {
  defineWidget,
  isWeatherSource,
  supportsSource,
  weatherSources,
  type WeatherObservation,
} from './index.js';

it('lets a minimal host resolve only exact, versioned weather source contracts', () => {
  const widget = defineWidget({
    type: 'synthetic-weather',
    version: 1,
    locations: ['page'],
    source: weatherSources.weather,
    parseConfig: (value: unknown) => value,
  });
  const sample: WeatherObservation = {
    current: {
      temperature: 21.5,
      feelsLike: 20.8,
      humidity: 55,
      windSpeed: 12.4,
      condition: 'partly-cloudy',
      isDay: true,
    },
    daily: [
      {
        date: '2026-11-17',
        tempMin: 15,
        tempMax: 24,
        condition: 'clear',
        precipitationProbability: 10,
      },
    ],
    location: { latitude: 52.52, longitude: 13.41, name: 'Berlin' },
    unit: 'metric',
    provider: { id: 'open-meteo', attribution: 'Open-Meteo (CC BY 4.0)' },
    cache: { fetchedAt: 1000, expiresAt: 601000, hit: false },
  };
  expect(supportsSource(widget.source, weatherSources.weather)).toBe(true);
  expect(supportsSource(widget.source, { ...weatherSources.weather, version: 2 })).toBe(false);
  expect(isWeatherSource(widget.source)).toBe(true);
  expect(isWeatherSource({ ...weatherSources.weather, version: 2 })).toBe(false);
  expect(isWeatherSource(null)).toBe(false);
  expect(sample.daily).toHaveLength(1);
});
