// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider } from '../../../ui/host.js';
import { MaintenanceContent, maintenanceFormatter } from './index.js';
import { en, ptBR } from '../messages.js';
import type { MaintenanceReading } from './use-reading.js';

afterEach(cleanup);
function show(reading: MaintenanceReading, locale = 'en', messages: Record<string, string> = en) {
  const openMonitor = vi.fn();
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      messages[key] ?? key,
    );
  render(
    <WidgetHostProvider value={{ locale, t, openMonitor }}>
      <MaintenanceContent reading={reading} />
    </WidgetHostProvider>,
  );
  return openMonitor;
}
it('distinguishes loading, error, empty, and retained stale data', () => {
  show({ status: 'loading' });
  expect(screen.getByRole('status')).toBeTruthy();
  cleanup();
  show({ status: 'error' });
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  cleanup();
  show({
    status: 'ready',
    stale: true,
    data: { generatedAt: 1_700_000_000_000, items: [], total: 0 },
  });
  expect(screen.getByText('No maintenance scheduled')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('last reading');
});
it('presents dates in the browser zone including DST and navigates by keyboard-accessible button', () => {
  const now = Date.parse('2026-03-08T06:30:00Z');
  const startsAt = now,
    endsAt = Date.parse('2026-03-08T07:30:00Z');
  const open = show(
    {
      status: 'ready',
      stale: false,
      data: {
        generatedAt: now,
        total: 2,
        items: [{ id: 1, monitorId: 9, name: 'Service', startsAt, endsAt, hasService: true }],
      },
    },
    'pt-BR',
    ptBR,
  );
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
  const button = screen.getByRole('button', { name: /Service.*Em andamento/ });
  expect(button.textContent).toContain(format.format(startsAt));
  expect(button.textContent).toContain(format.format(endsAt));
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(open).toHaveBeenCalledWith(9, true);
  expect(screen.getByText('Mostrando 1 de 2')).toBeTruthy();
});

it('formats the DST transition in the specified browser timezone', () => {
  const format = maintenanceFormatter('en-US', 'America/New_York');
  expect(format.format(Date.parse('2026-03-08T06:30:00Z'))).toContain('1:30 AM');
  expect(format.format(Date.parse('2026-03-08T07:30:00Z'))).toContain('3:30 AM');
});

it('labels a standalone probe and opens probe management through the host', () => {
  const open = show({
    status: 'ready',
    stale: false,
    data: {
      generatedAt: 1000,
      total: 1,
      items: [
        { id: 2, monitorId: 4, name: 'Probe A', startsAt: 2000, endsAt: 3000, hasService: false },
      ],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Probe A, Probe, Scheduled.*Open probes/ }));
  expect(open).toHaveBeenCalledWith(4, false);
});
