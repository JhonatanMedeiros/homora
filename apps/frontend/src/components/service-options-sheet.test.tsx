// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setLocale } from '@/i18n';
import { ServiceOptionsSheet } from './service-options-sheet';

beforeEach(() => setLocale('en'));
afterEach(cleanup);

const counts = { all: 18, down: 7, degraded: 0, maintenance: 0, ok: 0, unmeasured: 0 };

function setup(overrides: Partial<Parameters<typeof ServiceOptionsSheet>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onArrangeChange: vi.fn(),
    onViewChange: vi.fn(),
    onHostSuggestions: vi.fn(),
  };
  render(
    <ServiceOptionsSheet
      toolbar={{
        arrange: 'group',
        onArrangeChange: handlers.onArrangeChange,
        view: 'list',
        onViewChange: handlers.onViewChange,
        showDescriptions: true,
        onShowDescriptionsChange: () => {},
        showHostSuggestions: true,
        onHostSuggestions: handlers.onHostSuggestions,
      }}
      status={{ selected: 'all', counts, onSelect: handlers.onSelect }}
      {...overrides}
    />,
  );
  return handlers;
}

it('keeps every Home control behind one button until it is opened', () => {
  setup();
  expect(screen.queryByText('Suggested hosts')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /options/i }));
  expect(screen.getByRole('group', { name: 'Filter by status' })).toBeTruthy();
  expect(screen.getByRole('radiogroup', { name: 'Arrange services' })).toBeTruthy();
  expect(screen.getByRole('radiogroup', { name: 'Layout' })).toBeTruthy();
});

it('filters by status from the sheet', () => {
  const { onSelect } = setup();
  fireEvent.click(screen.getByRole('button', { name: /options/i }));
  fireEvent.click(screen.getByRole('button', { name: /Offline/ }));
  expect(onSelect).toHaveBeenCalledWith('down');
});

it('opens host suggestions and closes the sheet', () => {
  const { onHostSuggestions } = setup();
  fireEvent.click(screen.getByRole('button', { name: /options/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Suggested hosts' }));
  expect(onHostSuggestions).toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('flags an active status filter on the button and hides the filter in host views', () => {
  setup({ status: { selected: 'down', counts, onSelect: () => {} } });
  expect(screen.getByText('1 filter active')).toBeTruthy();
  cleanup();
  setup({ status: undefined });
  fireEvent.click(screen.getByRole('button', { name: /options/i }));
  expect(screen.queryByRole('group', { name: 'Filter by status' })).toBeNull();
});
