// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { listWidgets } from '@homora/widgets/registry';
import { setLocale } from '@/i18n';
import { summaryContent, summaryRenderers } from './summary-content';

/** Nothing is read until a widget that needs it is asked for. */
const untouched = new Proxy(
  {},
  {
    get: (_, key) => {
      throw new Error(`read ${String(key)}`);
    },
  },
) as never;
const content = summaryContent({
  data: untouched,
  sources: untouched,
  health: untouched,
  area: untouched,
  range: '24h',
  pending: 0,
  openService: () => {},
  openEntry: () => {},
  navigate: () => {},
  showState: () => {},
  showHost: () => {},
});
const show = (type: string, config: unknown = {}, name = '') =>
  render(<>{content({ type, name, config }).node}</>);

beforeEach(() => setLocale('en'));
afterEach(cleanup);

it('has a drawing for every widget only the Summary shows', () => {
  const own = listWidgets()
    .filter((definition) => definition.summaryOnly)
    .map((definition) => definition.type);
  expect(own.length).toBeGreaterThan(0);
  expect(Object.keys(summaryRenderers).sort()).toEqual(own.sort());
});

it('says so when it cannot draw a widget, instead of leaving it out', () => {
  show('summary-from-the-future');
  expect(screen.getByText('This version of Homora cannot show this widget.')).toBeTruthy();
});

it('says so when the settings cannot be read, without widening them', () => {
  show('summary-latency', { groups: 'Media' }, 'Media latency');
  expect(screen.getByText(/settings of this widget cannot be read/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Media latency' })).toBeTruthy();
});
