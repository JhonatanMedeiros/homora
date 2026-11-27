// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImpactConsultation } from './impact-consultation';
import { setLocale } from '@/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setLocale('pt-BR');
});
const services = [
  { id: 1, name: 'DNS' },
  { id: 2, name: 'App' },
  { id: 3, name: 'Client' },
];

it('shows direct and transitive paths and selects a related service', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { serviceId: 2, dependsOnId: 1 },
          { serviceId: 3, dependsOnId: 2 },
        ]),
      ),
    ),
  );
  const select = vi.fn();
  render(<ImpactConsultation roots={[services[0]!]} services={services} onSelect={select} />);
  fireEvent.click(screen.getByRole('button', { name: /avaliar impacto|assess potential/i }));
  expect(await screen.findByText(/transitivo|transitive/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Client' }));
  expect(select).toHaveBeenCalledWith(3);
  expect(screen.getByText(/não é uma falha observada|not an observed failure/i)).toBeTruthy();
});

it('reports unavailable data rather than a false empty graph', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
  render(<ImpactConsultation roots={[services[0]!]} services={services} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /avaliar impacto|assess potential/i }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText(/nenhum serviço dependente|no dependent services/i)).toBeNull();
});

it.each(['en', 'pt-BR'] as const)('explains empty records in %s', async (locale) => {
  setLocale(locale);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
  render(<ImpactConsultation roots={[services[0]!]} services={services} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /avaliar impacto|assess potential/i }));
  expect(await screen.findByText(/nenhum serviço dependente|no dependent services/i)).toBeTruthy();
  expect(screen.getByText(/relações não registradas|unrecorded relationships/i)).toBeTruthy();
});

it('warns when a reading is old', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
  render(<ImpactConsultation roots={[services[0]!]} services={services} onSelect={() => {}} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /avaliar impacto|assess potential/i }));
  });
  expect(screen.getByText(/nenhum serviço dependente|no dependent services/i)).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(150_000);
  });
  expect(screen.getByText(/podem estar desatualizados|may be out of date/i)).toBeTruthy();
});
