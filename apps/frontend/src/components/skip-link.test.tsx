// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { SkipLink } from '@/components/skip-link';

beforeEach(() => setLocale('en'));
afterEach(cleanup);

it('moves focus to the first service on the Home', () => {
  render(
    <>
      <SkipLink home />
      <main id="content" tabIndex={-1}>
        <button type="button">Toolbar</button>
        <div data-homora="service-card">
          <a href="http://media.test">Media</a>
        </div>
      </main>
    </>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Skip to services' }));
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Media' }));
});

it('moves focus to the content elsewhere', () => {
  render(
    <>
      <SkipLink home={false} />
      <main id="content" tabIndex={-1}>
        Settings
      </main>
    </>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
  expect(document.activeElement).toBe(screen.getByRole('main'));
});
