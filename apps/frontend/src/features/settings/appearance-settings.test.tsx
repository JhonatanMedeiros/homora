// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_APPEARANCE, type Appearance } from '@homora/shared';
import { AppearanceSettings } from './appearance-settings';
import { resetAppearanceStore } from '@/hooks/use-appearance';
import { setLocale } from '@/i18n';
import { chooseSelectOption } from '@/test-select';

type Call = { method: string; body: unknown };
let calls: Call[];
let stored: Appearance;

function mockServer(initial: Appearance = DEFAULT_APPEARANCE) {
  stored = initial;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, body });
      if (method === 'PUT') stored = body;
      if (method === 'DELETE') stored = DEFAULT_APPEARANCE;
      return new Response(JSON.stringify({ appearance: stored }));
    }),
  );
}

beforeEach(() => {
  setLocale('en');
  resetAppearanceStore();
  mockServer();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
});

const save = () => screen.getByRole('button', { name: 'Save' });

it('offers every preset as a radio and starts on Ember with Save disabled', async () => {
  render(<AppearanceSettings />);
  const accent = screen.getByRole('radiogroup', { name: 'Accent color' });
  expect(accent).toBeTruthy();
  for (const name of ['Ember', 'Moss', 'Sky', 'Rose', 'Violet', 'Slate', 'Custom'])
    expect(screen.getByRole('radio', { name })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Ember' }).getAttribute('aria-checked')).toBe('true');
  expect(save().hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Saved');
  for (const name of ['Flat', 'Dusk', 'Ember glow', 'Forest', 'Ocean', 'Sand light'])
    expect(screen.getByRole('radio', { name })).toBeTruthy();
});

it('saves a chosen preset and applies it to the page', async () => {
  render(<AppearanceSettings />);
  fireEvent.click(screen.getByRole('radio', { name: 'Moss' }));
  expect(screen.getByRole('status').textContent).toContain('Unsaved');
  fireEvent.click(save());
  await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ accent: 'moss' });
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--ap-primary-light')).toBe('#4d7c0f'),
  );
});

it('exposes each choice group as a named radio group with checked state', () => {
  render(<AppearanceSettings />);
  for (const name of ['Accent color', 'Page background']) {
    const group = screen.getByRole('radiogroup', { name });
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  }
});

it('blocks Save and explains in text when a custom accent fails contrast', () => {
  render(<AppearanceSettings />);
  fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
  fireEvent.change(screen.getByLabelText('Custom color (hex)'), { target: { value: '#ffe066' } });
  expect(save().hasAttribute('disabled')).toBe(true);
  expect(screen.getByText('Contrast too low')).toBeTruthy();
  expect(
    screen.getByText(/The accent is .*:1 on cards in the light theme; it needs 3:1/),
  ).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Cannot save');
  fireEvent.change(screen.getByLabelText('Custom color (hex)'), { target: { value: '#2f7d6b' } });
  expect(screen.queryByText('Contrast too low')).toBeNull();
  expect(save().hasAttribute('disabled')).toBe(false);
});

it('rejects a malformed custom color in text', () => {
  render(<AppearanceSettings />);
  fireEvent.click(screen.getByRole('radio', { name: 'Custom' }));
  fireEvent.change(screen.getByLabelText('Custom color (hex)'), { target: { value: 'red' } });
  expect(screen.getByText(/followed by six hexadecimal digits/)).toBeTruthy();
  expect(save().hasAttribute('disabled')).toBe(true);
});

it('offers card opacity from 60 to 100 and the blur switch', async () => {
  render(<AppearanceSettings />);
  await chooseSelectOption('Card opacity', '70%');
  fireEvent.click(screen.getByRole('switch', { name: 'Blur behind cards' }));
  fireEvent.click(save());
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      cardOpacity: 70,
      blur: true,
    }),
  );
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--ap-card-opacity')).toBe('0.7'),
  );
});

it('resets to the default look', async () => {
  mockServer({ ...DEFAULT_APPEARANCE, accent: 'rose' });
  render(<AppearanceSettings />);
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Rose' }).getAttribute('aria-checked')).toBe('true'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: 'Ember' }).getAttribute('aria-checked')).toBe('true'),
  );
  expect(document.documentElement.style.getPropertyValue('--ap-primary-light')).toBe('');
});

it('shows a message and keeps the default when loading fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('nope', { status: 500 })),
  );
  render(<AppearanceSettings />);
  expect(await screen.findByText(/Could not load the saved appearance/)).toBeTruthy();
});
