// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SafeModeBanner } from '@/components/safe-mode-banner';
import { resetCustomCssStore } from '@/hooks/use-custom-css';
import { setLocale } from '@/i18n';
import { CustomCssSettings } from './custom-css-settings';

type Server = { css: string; enabled: boolean };
let server: Server;
let calls: { method: string; body: unknown }[];

const view = () => ({
  ...server,
  bytes: new TextEncoder().encode(server.css).length,
  version: 'v' + server.css.length,
});

function mockServer(initial: Server) {
  server = { ...initial };
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, body });
      if (method === 'PUT') {
        if (typeof body.css === 'string') server.css = body.css;
        if (typeof body.enabled === 'boolean') server.enabled = body.enabled;
      }
      return new Response(JSON.stringify(view()));
    }),
  );
}

const link = () => document.getElementById('homora-custom-css');

beforeEach(() => {
  setLocale('en');
  window.innerWidth = 1280;
  window.history.replaceState(null, '', '/');
  resetCustomCssStore();
  mockServer({ css: '', enabled: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetCustomCssStore();
  window.history.replaceState(null, '', '/');
});

const text = () => screen.getByLabelText('Stylesheet') as HTMLTextAreaElement;

it('loads the stylesheet as a same-origin link, never inline, when it is on', async () => {
  mockServer({ css: 'a { color: red }', enabled: true });
  render(<CustomCssSettings />);
  await waitFor(() => expect(link()).not.toBeNull());
  expect(link()?.getAttribute('href')).toMatch(/^\/api\/appearance\/custom\.css\?v=[a-z0-9]+$/);
  expect(document.querySelector('style[data-custom]')).toBeNull();
  expect(text().value).toBe('a { color: red }');
});

it('adds no stylesheet while it is off', async () => {
  mockServer({ css: 'a { color: red }', enabled: false });
  render(<CustomCssSettings />);
  await waitFor(() => expect(text().value).toBe('a { color: red }'));
  expect(link()).toBeNull();
});

it('saves valid CSS and shows the size', async () => {
  render(<CustomCssSettings />);
  fireEvent.change(text(), { target: { value: '[data-homora="top-bar"] { display: none; }' } });
  expect(screen.getByText(/\d+ of 20480 bytes/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save CSS' }));
  await waitFor(() => expect(server.css).toContain('top-bar'));
});

it.each([
  ['@import "x.css";', /@import is not allowed/],
  ['a { background: url(https://x.example/a.png) }', /Addresses to other sites/],
  ['a { width: expression(1) }', /script features/],
  ['a {', /braces/],
])('blocks Save for %s and says why in text', (css, message) => {
  render(<CustomCssSettings />);
  fireEvent.change(text(), { target: { value: css } });
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save CSS' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Cannot save/)).toBeTruthy();
});

it('turning it off keeps the text', async () => {
  mockServer({ css: 'a { color: red }', enabled: true });
  render(<CustomCssSettings />);
  await waitFor(() => expect(link()).not.toBeNull());
  fireEvent.click(screen.getByRole('switch', { name: 'Use custom CSS' }));
  await waitFor(() => expect(link()).toBeNull());
  expect(server).toEqual({ css: 'a { color: red }', enabled: false });
  expect(text().value).toBe('a { color: red }');
});

it('reset turns it off without touching the text', async () => {
  mockServer({ css: 'a { color: red }', enabled: true });
  render(<CustomCssSettings />);
  await waitFor(() => expect(link()).not.toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
  await waitFor(() => expect(server.enabled).toBe(false));
  expect(server.css).toBe('a { color: red }');
});

it('says it applies to everyone and offers no promise of stable hooks', () => {
  render(<CustomCssSettings />);
  expect(
    screen.getByText(/everyone who sees Homora, including a future read-only guest/),
  ).toBeTruthy();
  expect(screen.getByText(/no promise/)).toBeTruthy();
  expect(screen.getByText(/data-homora="service-card"/)).toBeTruthy();
});

it('is read-only on a phone, with a notice and the on/off switch', async () => {
  window.innerWidth = 390;
  mockServer({ css: 'a { color: red }', enabled: true });
  render(<CustomCssSettings />);
  expect(await screen.findByText(/not optimized for phones yet/)).toBeTruthy();
  await waitFor(() => expect(text().value).toBe('a { color: red }'));
  expect(text().readOnly).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save CSS' })).toBeNull();
  expect(screen.getByRole('switch', { name: 'Use custom CSS' })).toBeTruthy();
});

it('safe mode (?safe=1) loads no stylesheet and shows a banner with a way out', async () => {
  window.history.replaceState(null, '', '/?safe=1');
  resetCustomCssStore({ safe: true });
  mockServer({ css: 'button { display: none }', enabled: true });
  const onEdit = vi.fn();
  render(<SafeModeBanner onEdit={onEdit} />);
  expect(screen.getByText('Safe mode: custom CSS is not loaded in this tab.')).toBeTruthy();
  await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
  expect(link()).toBeNull();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit the CSS' }));
  expect(onEdit).toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Turn off custom CSS' }));
  await waitFor(() => expect(server).toEqual({ css: 'button { display: none }', enabled: false }));
});

it('leaving safe mode brings the stylesheet back and clears the address flag', async () => {
  window.history.replaceState(null, '', '/?safe=1');
  resetCustomCssStore({ safe: true });
  mockServer({ css: 'a { color: red }', enabled: true });
  render(<SafeModeBanner onEdit={() => {}} />);
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  expect(link()).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Leave safe mode' }));
  await waitFor(() => expect(link()).not.toBeNull());
  expect(window.location.search).toBe('');
  expect(screen.queryByText(/Safe mode/)).toBeNull();
});

it('shows no banner outside safe mode', () => {
  render(<SafeModeBanner onEdit={() => {}} />);
  expect(screen.queryByText(/Safe mode/)).toBeNull();
});
