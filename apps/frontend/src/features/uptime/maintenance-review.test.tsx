// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MaintenanceReview } from './maintenance-review';
import { setLocale } from '@/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});
const services = [{ id: 1, name: 'Synthetic service' }];

it.each(['en', 'pt-BR'] as const)(
  'lets a person review overlapping windows and a temporary checklist in %s without applying changes',
  async (locale) => {
    setLocale(locale);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          windows: [{ id: 2, serviceId: 1, startsAt: 150, endsAt: 250, note: '' }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const view = render(
      <MaintenanceReview serviceId={1} services={services} startsAt={100} endsAt={200} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /revisar preparação|review preparation/i }));
    expect(await screen.findByText(/se sobrepõe|overlaps this proposed/i)).toBeTruthy();
    const check = screen.getByRole('checkbox', {
      name: /dependências registradas|recorded dependencies/i,
    });
    fireEvent.click(check);
    expect(check.dataset.state).toBe('checked');
    expect(
      fetcher.mock.calls.every(
        ([url, init]) => url === '/api/services/1/maintenance' && !init?.method,
      ),
    ).toBe(true);
    view.unmount();
    render(<MaintenanceReview serviceId={1} services={services} startsAt={100} endsAt={200} />);
    fireEvent.click(screen.getByRole('button', { name: /revisar preparação|review preparation/i }));
    expect(
      screen.getByRole('checkbox', { name: /dependências registradas|recorded dependencies/i })
        .dataset.state,
    ).toBe('unchecked');
  },
);

it('does not report no overlaps when reading existing windows fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
  render(<MaintenanceReview serviceId={1} services={services} startsAt={100} endsAt={200} />);
  fireEvent.click(screen.getByRole('button', { name: /revisar preparação|review preparation/i }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText(/nenhuma sobreposição|no overlap found/i)).toBeNull();
});
