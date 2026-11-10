// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../App';
import { apiError, formatNumber, getLocale, setLocale, t } from './index';
import { en } from './en';
import { ptBR } from './pt-br';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});

it('mantém as mesmas chaves em inglês e português, sem texto vazio', () => {
  expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  for (const [key, value] of Object.entries({ ...en, ...ptBR })) expect(value, key).not.toBe('');
});

it('mantém os mesmos marcadores {nome} nas duas línguas', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(en) as (keyof typeof en)[])
    expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
});

it('substitui marcadores e escolhe o plural do idioma', () => {
  expect(t('card.edit', { name: 'Jellyfin' })).toBe('Edit Jellyfin');
  expect(t('page.servicesCount', { count: 1 })).toBe('1 service');
  expect(t('page.servicesCount', { count: 3 })).toBe('3 services');
  setLocale('pt-BR');
  expect(t('page.servicesCount', { count: 1 })).toBe('1 serviço');
  expect(t('page.servicesCount', { count: 3 })).toBe('3 serviços');
});

it('formata números conforme o idioma', () => {
  expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1,234.5');
  setLocale('pt-BR');
  expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe('1.234,5');
});

it('traduz mensagens conhecidas da API apenas em inglês', () => {
  expect(apiError('Serviço não encontrado.')).toBe('Service not found.');
  expect(apiError('Mensagem desconhecida.')).toBe('Mensagem desconhecida.');
  setLocale('pt-BR');
  expect(apiError('Serviço não encontrado.')).toBe('Serviço não encontrado.');
});

it('lembra a escolha e atualiza o atributo lang do documento', () => {
  setLocale('pt-BR');
  expect(localStorage.getItem('homora-locale')).toBe('pt-BR');
  expect(document.documentElement.lang).toBe('pt-BR');
  setLocale('en');
  expect(getLocale()).toBe('en');
  expect(document.documentElement.lang).toBe('en');
});

it('mostra a interface em inglês e troca para português sem recarregar', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByText('Your dashboard is empty')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /Language: Português/ })[0]);
  expect(await screen.findByText('Seu painel está vazio')).toBeTruthy();
  expect(getLocale()).toBe('pt-BR');
});
