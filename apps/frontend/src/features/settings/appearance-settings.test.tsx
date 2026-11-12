// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_APPEARANCE, type Appearance, type BackgroundImage } from '@homora/shared';
import { AppearanceSettings } from './appearance-settings';
import { resetAppearanceStore } from '@/hooks/use-appearance';
import { setLocale } from '@/i18n';
import { chooseSelectOption } from '@/test-select';

type Call = { method: string; body: unknown };
let calls: Call[];
let stored: Appearance;
let rejectUpload = false;
const PICTURE: BackgroundImage = {
  name: 'a'.repeat(32) + '.webp',
  dim: 60,
  position: 'fill',
  average: '#808080',
  width: 1920,
  height: 1080,
  bytes: 150_000,
  originalBytes: 1_800_000,
};

function mockServer(initial: Appearance = DEFAULT_APPEARANCE) {
  stored = initial;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/appearance/background') {
        calls.push({ method: `${method} image`, body: init?.body });
        if (method === 'PUT') {
          if (rejectUpload)
            return new Response(JSON.stringify({ code: 'image-unsupported' }), { status: 415 });
          stored = { ...stored, image: PICTURE };
        } else stored = { ...stored, image: null };
        return new Response(JSON.stringify({ appearance: stored }));
      }
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
  rejectUpload = false;
  window.innerWidth = 1280;
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

const choose = (file: File) =>
  fireEvent.change(screen.getByLabelText('Choose image', { selector: 'input' }), {
    target: { files: [file] },
  });

it('uploads a picture, shows its size before and after, and applies it', async () => {
  render(<AppearanceSettings />);
  expect(screen.getByText('No background image.')).toBeTruthy();
  choose(new File(['x'], 'bg.png', { type: 'image/png' }));
  expect(
    await screen.findByText(/1\.7 MB uploaded, 146 KB after processing \(1920×1080 px\)/),
  ).toBeTruthy();
  expect(calls.some((c) => c.method === 'PUT image')).toBe(true);
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--ap-page-background-light')).toContain(
      '/api/appearance/background/',
    ),
  );
  expect(screen.getByRole('slider', { name: 'Dimming' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Tile' })).toBeTruthy();
});

it('does not send a file above 2 MB', async () => {
  render(<AppearanceSettings />);
  choose(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
  expect(await screen.findByText('The image is larger than 2 MB.')).toBeTruthy();
  expect(calls.some((c) => c.method === 'PUT image')).toBe(false);
});

it('shows the server reason when a file is refused', async () => {
  rejectUpload = true;
  render(<AppearanceSettings />);
  choose(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
  expect(await screen.findByText('Use a JPG, PNG or WebP image.')).toBeTruthy();
});

it('removes the picture', async () => {
  mockServer({ ...DEFAULT_APPEARANCE, image: PICTURE });
  render(<AppearanceSettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove image' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE image')).toBe(true));
  expect(await screen.findByText('No background image.')).toBeTruthy();
  expect(document.documentElement.style.getPropertyValue('--ap-page-background-light')).toBe('');
});

it('blocks Save when the dimming leaves the text hard to read', async () => {
  mockServer({ ...DEFAULT_APPEARANCE, image: { ...PICTURE, dim: 80 } });
  render(<AppearanceSettings />);
  const slider = await screen.findByRole('slider', { name: 'Dimming' });
  fireEvent.keyDown(slider, { key: 'Home' });
  await waitFor(() => expect(screen.getByText('Contrast too low')).toBeTruthy());
  expect(save().hasAttribute('disabled')).toBe(true);
});

it('does not offer uploading on a phone', async () => {
  window.innerWidth = 390;
  mockServer({ ...DEFAULT_APPEARANCE, image: PICTURE });
  render(<AppearanceSettings />);
  expect(await screen.findByText(/not offered on phones/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Choose image|Replace image/ })).toBeNull();
  expect(screen.queryByTestId('image-dropzone')).toBeNull();
  expect(
    screen.getByRole('slider', { name: 'Dimming' }).getAttribute('data-disabled'),
  ).not.toBeNull();
});
