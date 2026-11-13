import { expect, it } from 'vitest';
import { locales, supportedLocales } from './index.js';
import { en, ptBR } from './frontend.js';
import { notificationEnglish, notificationPortuguese } from './notifications.js';

it('keeps supported locales and their labels in sync', () => {
  expect(locales.map(({ id }) => id)).toEqual([...supportedLocales]);
});

it('keeps application and notification catalogs complete and nonempty', () => {
  for (const [english, portuguese] of [
    [en, ptBR],
    [notificationEnglish, notificationPortuguese],
  ]) {
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
    for (const dictionary of [english, portuguese])
      for (const [key, value] of Object.entries(dictionary)) expect(value.trim(), key).not.toBe('');
  }
});
