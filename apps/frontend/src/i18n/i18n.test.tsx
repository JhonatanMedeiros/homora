// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../App';
import { apiError, formatNumber, getLocale, setLocale, t, tOr } from './index';
import { en } from './en';
import { ptBR } from './pt-br';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});

it('maintains the same keys in English and Portuguese, without empty text', () => {
  expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  for (const dictionary of [en, ptBR])
    for (const [key, value] of Object.entries(dictionary)) expect(value, key).not.toBe('');
});

it('maintains the same {name} placeholders in both languages', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(en) as (keyof typeof en)[])
    expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
});

it('replaces placeholders and picks the language plural form', () => {
  expect(t('card.edit', { name: 'Jellyfin' })).toBe('Edit Jellyfin');
  expect(t('page.servicesCount', { count: 1 })).toBe('1 service');
  expect(t('page.servicesCount', { count: 3 })).toBe('3 services');
  setLocale('pt-BR');
  expect(t('page.servicesCount', { count: 1 })).toBe('1 serviço');
  expect(t('page.servicesCount', { count: 3 })).toBe('3 serviços');
});

it('translates integration messages and interpolates unknown integration fallbacks', () => {
  expect(tOr('data.jellyfin', 'fallback', { name: 'Lab', version: '1' })).toBe(
    'Server: Lab · Version: 1',
  );
  setLocale('pt-BR');
  expect(tOr('data.jellyfin', 'fallback', { name: 'Lab', version: '1' })).toBe(
    'Servidor: Lab · Versão: 1',
  );
  expect(tOr('unknown.integration', 'Server: {name}', { name: 'Lab' })).toBe('Server: Lab');
  expect(tOr(undefined, 'Server: {name}', { name: 'Lab' })).toBe('Server: Lab');
});

it('formats numbers according to the locale', () => {
  expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1,234.5');
  setLocale('pt-BR');
  expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1.234,5');
});

it('translates known API messages when in English or Portuguese', () => {
  const body = { code: 'service-not-found', error: 'Service not found.' };
  expect(apiError(body, 'x')).toBe('Service not found.');
  setLocale('pt-BR');
  expect(apiError(body, 'x')).toBe('Serviço não encontrado.');
  expect(apiError({ code: 'unknown', error: 'Custom message.' }, 'x')).toBe('Custom message.');
  expect(apiError({ code: 'unknown' }, 'fallback')).toBe('fallback');
  expect(apiError(null, 'fallback')).toBe('fallback');
});

it('has translations for all backend error codes', () => {
  const source = readFileSync(resolve(__dirname, '../../../backend/src/api-error.ts'), 'utf8');
  const codes = [...source.matchAll(/^ {2}'([a-z-]+)':/gm)].map((match) => match[1]);
  expect(codes.length).toBeGreaterThan(40);
  for (const code of codes) {
    expect(`apiError.${code}` in en, code).toBe(true);
    expect(`apiError.${code}` in ptBR, code).toBe(true);
  }
});

it('remembers choice and updates document lang attribute', () => {
  setLocale('pt-BR');
  expect(localStorage.getItem('homora-locale')).toBe('pt-BR');
  expect(document.documentElement.lang).toBe('pt-BR');
  setLocale('en');
  expect(getLocale()).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});

it('displays the interface in English and switches to Portuguese without reload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Language: English' }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole('menuitemradio', { name: 'English' }).getAttribute('aria-checked')).toBe(
    'true',
  );
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Português (Brasil)' }));
  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy();
  expect(getLocale()).toBe('pt-BR');
});

it('keeps management and settings accessible in English', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  const rail = await screen.findByRole('navigation', { name: 'Main navigation' });
  fireEvent.click(within(rail).getByRole('button', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
  fireEvent.click(within(rail).getByRole('button', { name: 'Home' }));
  expect(screen.getByRole('heading', { name: 'Everything in its place.' })).toBeTruthy();
});
