// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ServiceCard } from './service-card';
import type { ServiceStatus } from '@/lib/services';

afterEach(cleanup);

const noop = () => {};
function show(
  status?: ServiceStatus,
  blocked = false,
  extra: {
    list?: boolean;
    compact?: boolean;
    description?: string;
    onEdit?: () => void;
    openTarget?: 'new-tab' | 'same-tab';
  } = {},
) {
  cleanup();
  return render(
    <ul>
      <ServiceCard
        service={{
          id: 1,
          name: 'Wiki',
          url: 'https://wiki.test',
          category: 'Casa',
          description: extra.description ?? '',
          openTarget: extra.openTarget,
        }}
        status={status}
        blocked={blocked}
        managing={false}
        list={extra.list}
        compact={extra.compact}
        showDescription
        confirmingRemoval={false}
        onEdit={extra.onEdit ?? noop}
        onRemove={noop}
        onCancelRemoval={noop}
      />
    </ul>,
  );
}
const base = { lastAttempt: '2026-11-10T12:30:00.000Z' };

afterEach(() => vi.unstubAllGlobals());

it('says "No ar" for any healthy answer and keeps the HTTP code out of sight', () => {
  show({ ...base, status: 'available', reason: 'redirect', httpStatus: 302, latencyMs: 72 });
  expect(screen.getByText('No ar')).toBeTruthy();
  expect(screen.getByText('72 ms')).toBeTruthy();
  expect(screen.queryByText(/Redireciona|HTTP 302/)).toBeNull();
  expect(screen.getByText('72 ms').closest('span[title]')?.getAttribute('title')).toBe('HTTP 302');
  expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull();

  show({ ...base, status: 'available', reason: 'responding', httpStatus: 200, latencyMs: 30 });
  expect(screen.getByText('No ar')).toBeTruthy();
  expect(screen.getByText('30 ms')).toBeTruthy();
});

it('tags healthy answers that need a qualifier', () => {
  show({ ...base, status: 'available', reason: 'login-required', httpStatus: 401, latencyMs: 42 });
  expect(screen.getByText('No ar')).toBeTruthy();
  expect(screen.getByText('login')).toBeTruthy();
  expect(screen.getByText(/42 ms/)).toBeTruthy();

  show({ ...base, status: 'available', reason: 'reachable', httpStatus: null, latencyMs: 4 });
  expect(screen.getByText('ping')).toBeTruthy();
  expect(screen.getByText(/4 ms/)).toBeTruthy();
  expect(screen.queryByText(/HTTP|Responde ao ping/)).toBeNull();
});

it('explains failures in plain words with a Details button', () => {
  show({ ...base, status: 'unavailable', reason: 'not-found', httpStatus: 404, latencyMs: 9 });
  expect(screen.getByText('Fora do ar')).toBeTruthy();
  expect(screen.getByText('Página não encontrada (404)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Detalhes de Wiki' })).toBeTruthy();

  show({ ...base, status: 'unavailable', reason: 'error-status', httpStatus: 503, latencyMs: 212 });
  expect(screen.getByText('Servidor retornou erro 503')).toBeTruthy();

  show({
    ...base,
    status: 'unavailable',
    reason: 'no-response',
    httpStatus: null,
    latencyMs: null,
  });
  expect(screen.getByText(/Sem resposta · última tentativa/)).toBeTruthy();
  expect(screen.queryByText(/HTTP/)).toBeNull();
});

it('shows waiting, blocked, and tolerates responses without a reason', () => {
  show({ status: 'unknown', lastAttempt: null, reason: 'unchecked', httpStatus: null });
  expect(screen.getByText('Aguardando')).toBeTruthy();
  expect(screen.getByText('primeira checagem em instantes')).toBeTruthy();

  show({ ...base, status: 'unavailable', reason: 'no-response' }, true);
  expect(screen.getByText('Sem monitoramento')).toBeTruthy();
  expect(screen.getByText('Destino não autorizado para monitoramento')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull();

  show({ ...base, status: 'unavailable' });
  expect(screen.getByText('Fora do ar')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull();
});

it('hides a description that only repeats the name', () => {
  show({ ...base, status: 'available', reason: 'responding' }, false, { description: 'Wiki Casa' });
  expect(screen.queryByText('Wiki Casa')).toBeNull();
  show({ ...base, status: 'available', reason: 'responding' }, false, {
    description: 'Notas e documentação do lab',
  });
  expect(screen.getByText('Notas e documentação do lab')).toBeTruthy();
});

it('opens failure details from the card and loads the recent checks', async () => {
  const detail = {
    recent: [
      {
        observedAt: Date.now() - 180_000,
        status: 'available',
        reason: 'responding',
        httpStatus: 200,
        latencyMs: 40,
      },
      {
        observedAt: Date.now() - 120_000,
        status: 'unavailable',
        reason: 'no-response',
        httpStatus: null,
        latencyMs: null,
      },
    ],
    failingSince: Date.now() - 120_000,
    failingSinceIsApproximate: false,
    lastSuccess: { observedAt: Date.now() - 180_000, latencyMs: 40 },
  };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => detail }));
  vi.stubGlobal('fetch', fetchMock);
  const onEdit = vi.fn();
  show({ ...base, status: 'unavailable', reason: 'no-response', httpStatus: null }, false, {
    onEdit,
  });
  const button = screen.getByRole('button', { name: 'Detalhes de Wiki' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(await screen.findByText(/Sem resposta \(tempo esgotado/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/services/1/status-detail');
  expect(screen.getByText('Fora do ar desde')).toBeTruthy();
  expect(screen.getByRole('img', { name: '1 de 2 checagens recentes falharam' })).toBeTruthy();
  expect(screen.getByText(/O que tentar/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Editar Wiki' }));
  expect(onEdit).toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByText('Fora do ar desde')).toBeNull());
});

it('shows a short message when failure details cannot be loaded', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => ({}) })),
  );
  show({ ...base, status: 'unavailable', reason: 'error-status', httpStatus: 500 });
  fireEvent.click(screen.getByRole('button', { name: 'Detalhes de Wiki' }));
  expect(await screen.findByText('Não foi possível carregar os detalhes.')).toBeTruthy();
});

it('uses the same words in the list layout, with the failure sentence on its own line', () => {
  show(
    { ...base, status: 'available', reason: 'redirect', httpStatus: 302, latencyMs: 72 },
    false,
    { list: true },
  );
  expect(screen.getByText('No ar')).toBeTruthy();
  expect(screen.getByText('72 ms')).toBeTruthy();
  expect(screen.queryByText(/Redireciona/)).toBeNull();

  show({ ...base, status: 'unavailable', reason: 'no-response', httpStatus: null }, false, {
    list: true,
  });
  expect(screen.getByText('Fora do ar')).toBeTruthy();
  expect(screen.getByText(/Sem resposta/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Detalhes/ })).toBeNull();
});

it('respects the opening preference in list and card views', () => {
  for (const list of [true, false]) {
    show(undefined, false, { list });
    let link = screen.getByRole('link', { name: /Wiki/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('abre em nova aba');
    show(undefined, false, { list, openTarget: 'same-tab' });
    link = screen.getByRole('link', { name: /Wiki/ });
    expect(link.getAttribute('target')).toBeNull();
    expect(link.textContent).not.toContain('abre em nova aba');
  }
});

it('shows the compact tile with the state in words, latency and no history controls', () => {
  show(
    { ...base, status: 'available', reason: 'responding', httpStatus: 200, latencyMs: 72 },
    false,
    { compact: true, description: 'Documentação da casa' },
  );
  expect(document.querySelector('[data-layout="compact"]')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Wiki/ })).toBeTruthy();
  expect(screen.getByText('No ar')).toBeTruthy();
  expect(screen.getByText('72 ms')).toBeTruthy();
  // History, incidents and the period toggle belong to the cards layout and the detail page.
  expect(screen.queryByRole('button', { name: /Histórico|History/ })).toBeNull();
  expect(screen.queryByText('Documentação da casa')).toBeNull();
});

it('explains a failure in the compact tile and keeps the list layout winning over compact', () => {
  show({ ...base, status: 'unavailable', reason: 'no-response', httpStatus: null }, false, {
    compact: true,
  });
  expect(screen.getByText('Fora do ar')).toBeTruthy();
  expect(document.querySelector('[data-layout="compact"]')?.className).toContain(
    'border-destructive',
  );
  show({ ...base, status: 'available', reason: 'responding', httpStatus: 200 }, false, {
    compact: true,
    list: true,
  });
  expect(document.querySelector('[data-layout="compact"]')).toBeNull();
});
